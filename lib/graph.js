const { GraphError } = require('../errors/errors');
const { SimpleEventEmitter } = require('./mixins/mixins');
const { make_node_config } = require('./mixins/template');
const { Node, Edge, STATES, FINAL_STATES } = require('./nodes/node');

class NodeExec {
	constructor(node_id, error) {
		this.node_id = node_id;
		this.error = error;
	}
}

class Graph extends SimpleEventEmitter {
	#_original_context = {};
	#finished_nodes = [];
	#finish_promise = null;
	#finished = false;
	#runs = {};

	constructor({ id, name, root, nodes, edges, context={} }={}) {
		super();

		this.id = id;
		this.name = name;
		this.root = root;

		// Nodes is a map of id: Node()
		this.nodes = nodes;

		// Edges are a map of from: [to1, to2]
		this.edges = edges.reduce((agg, { from, to }) => {
			agg[from] = agg[from] || [];
			agg[from].push(to);
			return agg;
		}, {});

		this.#_original_context = { ...context };

		// Will be filled up on runtime
		this.final_nodes = new Set();
		this.output_stack = {};
		this.context = context;

		this.#apply_node_listeners();
	}

	#apply_node_listeners() {
		const listener = ({ from, to, target }) => {
			this.emit('node_state_changed', {
				from,
				to,
				node: target,
				node_id: target.id,
			});
		};

		Object.values(this.nodes).forEach(node => {
			node.on('state_changed', listener);
		});
	}

	#stack({ node_id, output }) {
		const new_stack = {...this.output_stack};

		if((node_id in new_stack) && !Array.isArray(new_stack[node_id])) {
			// Transform into array
			new_stack[node_id] = [new_stack[node_id]];
		}

		if(Array.isArray(new_stack[node_id])) {
			new_stack[node_id].push(output);
		} else {
			new_stack[node_id] = output;
		}

		this.output_stack = Object.freeze(new_stack);

		this.emit('output_stack', {
			stack: this.output_stack,
			latest: output,
			node: node_id
		});
	}

	#finish() {
		if(this.#finished) {
			throw new Error('Graph: cannot finish twice');
		}

		const { resolve, reject } = this.#finish_promise;

		// Only get NodeExec with errors
		const errors = this.#finished_nodes.filter(exec => exec.error);
		if(errors.length) {
			const error = new GraphError('GraphError: some nodes errored during execution. Catch this error and log the "errors" property to get more details', errors);
			this.emit('error', error);
			this.#finished = true;
			return reject(error);
		}

		// finish
		const final_outputs = Array.from(this.final_nodes).reduce((agg, node_id) => {
			agg[node_id] = this.output_stack[node_id];
			return agg;
		}, {});

		const output = {
			final_outputs,
			output_stack: this.output_stack,
			final_nodes: this.final_nodes,
		};

		this.emit('finish', output);
		this.#finished = true;
		// We need the final result
		return resolve(output);
	}

	#finish_node(node, error=null) {
		this.#finished_nodes.push(new NodeExec(node.id, error));

		// Finish graph if every node has finished running
		// Takes into account the nb of runs for every node
		// Thus allowing multi input nodes to run multiple times

		const run_size = Object.values(this.#runs).reduce((s, v) => s + v, 0);
		if(this.#finished_nodes.length === run_size) {
			// Graph is done
			this.#finish();
		}
	}

	reset() {
		// Runtime data
		this.output_stack = {};
		this.context = { ...this.#_original_context };

		// Finish data
		this.final_nodes = new Set();
		this.#finished_nodes = [];
		this.#finish_promise = null;
		this.#finished = false;
		this.#runs = {};

		this.emit('reset');
	}

	run({ inputs=null }={}) {
		// Freeze inputs to prevent nodes from changing them
		// and f-ing up the rest of the flow
		Object.freeze(inputs)

		// Reset graph to get everything back together for another run
		this.reset();

		// Save promise on instance to be able to resolve when needed
		return new Promise((resolve, reject) => {
			this.#finish_promise = { resolve, reject };

			// Run initial node
			return this.#run_lock({
				inputs,
				initial_inputs: inputs,
				// Initial values, root node, no parent and empty path
				node: this.root,
				parent_id: null,
				current_path: []
			});
		});
	}

	// This method allows us to run a node and then wait for it to finish
	// before running a new node
	#run_lock({ parent_id, node, inputs, initial_inputs, current_path }) {
		// Node has finished running or never started
		if(FINAL_STATES.includes(node.state)) {
			// Potential race-condition
			node.reset(STATES.IDLE);
			return this.run_node({
				node,
				inputs,
				initial_inputs,
				parent_id,
				current_path
			});
		}

		// Node is running, let's wait for it
		return new Promise(resolve => {
			const listener = () => {
				// The `to` argument is often not in sync with the node.state value
				// Since listeners are called synchronously by the event emitter
				// We must use node.state to be sure we have the actual value since
				// we can have more than 2 input nodes that can cause a deadlock
				if(!FINAL_STATES.includes(node.state)) {
					return;
				}

				node.removeEventListener('state_changed', listener);
				return resolve(this.#run_lock({
					node,
					inputs,
					initial_inputs,
					parent_id,
					current_path
				}));
			};

			node.on('state_changed', listener);
		});
	}

	run_node({ parent_id, node, inputs, initial_inputs, current_path }) {
		// Setup node run to track runs and async finishes
		this.#runs[node.id] = (this.#runs[node.id] ?? 0) + 1;

		// Data used to execute nodes and replace values on config templates
		const template_info = {
			inputs,
			initial_inputs,
			outputs: this.output_stack,
			context: this.context,
			env: Object.freeze({ ...process.env }),
		};

		const templated_node_config = make_node_config(template_info, node.config);

		// Allow nodes to done asynchronously if needed
		// this is useful for event listeners that come
		// later on the flow

		// Please note however that there is no way to know
		// if the graph "finished" already. So no error is thrown

		// Also note this IIFE to prevent multiple calls to done()
		const done = (() => {
			let called_once = false;

			const done = (error) => {
				if(called_once > 0) {
					throw new Error(`Tried to call done() more than once`);
				}

				if(!error) {
					// set up as done
					node.to(STATES.SUCCESS);
					this.#finish_node(node);
				} else {
					// Small abstraction artefact but allows the developer
					// to be lifted of this responsibility
					node.to(STATES.ERROR);
					this.#backpropagate(current_path);
				}

				this.#finish_node(node);
				called_once = true;
			};

			return done;
		})();

		// Setup of all the necessary data the nodes need to run
		// properly. Including the parent_id, their new templated config
		// and all graph-managed data (inputs (+initial), outputs, context) and env
		const execution_data = {
			...template_info,
			parent_id,
			config: templated_node_config
		};

		return node.pre_execute(execution_data).then(pre_x_result => {
			// Get children
			const edges = this.edges[node.id] || [];
			const children = edges.map(to => this.nodes[to]);

			if(pre_x_result === false || node.state === STATES.DID_NOT_RUN) {
				// break promise chain and setup next nodes as "ran"
				this.#propagate_stop(node, children);

				// Finish parent node
				return this.#finish_node(node);
			}

			return node.execute(execution_data, done).then(output => {
				this.#stack({ node_id: node.id, output });

				// Check if node is final and add it to final returns
				if(!children.length) {
					this.final_nodes.add(node.id);
				}

				// Clean up synchronously
				const post_exec = node.post_execute(execution_data);
				return Promise.all([output, post_exec]);

			}).then(([output, post_exec]) => {
				// Run all children
				return Promise.all(children.map(child => {
					return this.#run_lock({
						parent_id: node.id,
						node: child,
						inputs: output,
						initial_inputs,
						current_path: [...current_path, node.id]
					});
				}));

			}).then(() => {
				// If node is async (uses done()) we won't finish it yet
				// Else we finish after post_execution has happened and
				// children have run (in order to get the #runs in order)
				if(node.is_async) {
					return;
				}
				this.#finish_node(node);
			});
		}).catch(e => {
			this.#backpropagate(current_path);

			// Finishing with error will throw at the end
			this.#finish_node(node, e);
		});
	}

	#propagate_stop(node, children) {
		// Finish every child
		for(const child of children) {
			this.#finish_node(child);
		}
	}

	#backpropagate(path) {
		// Do it in backpropagation order
		for(const node_id of [...path].reverse()) {
			const node = this.nodes[node_id];
			node.to(STATES.BACKPROPAGATION_ERROR);
		}
	}

	static build({ id, name='', nodes=[], edges=[], context={} }) {
		const { from, to } = edges.reduce((agg, { from, to }) => {
			agg.from.push(from);
			agg.to.push(to);
			return agg;
		}, { from: [], to: [] });

		const nodes_by_id = nodes.reduce((agg, node) => {
			if(agg[node.id]) {
				throw new Error(`Found two nodes with the same id: ${node.id}`);
			}

			agg[node.id] = node;
			return agg;
		}, {});

		// find node without parent (without "to" edge)
		const root_nodes = nodes.filter(({ id }) => {
			return !to.includes(id);
		});

		if(root_nodes.length > 1) {
			throw new Error('Multiple root nodes found, cannot build graph tree');
		}

		const [root] = root_nodes;

		if(!root) {
			throw new Error('No root nodes found, cannot build graph tree');
		}

		for(const edge of edges) {
			if(!(nodes_by_id[edge.from])) {
				throw new Error(`Missing node: ${edge.from}`);
			}

			if(!(nodes_by_id[edge.to])) {
				throw new Error(`Missing node: ${edge.to}`);
			}
		}

		return new Graph({
			id,
			name,
			root,
			edges,
			context,
			nodes: nodes_by_id,
		});
	}
}

module.exports = { Graph };
