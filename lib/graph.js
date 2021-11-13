const { SimpleEventEmitter } = require('./mixins/mixins');
const { Node, Edge, STATES, FINAL_STATES } = require('./nodes/node');

class Graph extends SimpleEventEmitter {
	#_original_context = {};

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

	reset() {
		this.final_nodes = new Set();
		this.output_stack = {};
		this.context = { ...this.#_original_context };
		this.emit('reset');
	}

	run({ inputs=null }={}) {
		this.reset();
		return this.#run_lock({
			inputs,
			node: this.root,
		}).then(() => {
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
			return output;
		}).catch(e => {
			this.emit('error', e);
			throw e;
		});
	}

	// This method allows us to run a node and then wait for it to finish
	// before running a new node
	#run_lock({ node, inputs }) {
		// Node has finished running or never started
		if(FINAL_STATES.includes(node.state)) {
			// Potential race-condition
			node.reset(STATES.IDLE);
			return this.run_node({ node, inputs });
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
					inputs
				}));
			};

			node.on('state_changed', listener);
		});
	}

	run_node({ node, inputs }) {
		return node.pre_execute({
			inputs,
			outputs: this.output_stack,
			context: this.context
		}).then(pre_x_result => {
			if(pre_x_result === false || node.state === STATES.DID_NOT_RUN) {
				// break promise
				return null;
			}

			return node.execute({
				inputs,
				outputs: this.output_stack,
				context: this.context
			}).then(output => {
				this.#stack({ node_id: node.id, output });

				// Clean up
				node.post_execute({
					inputs,
					outputs: this.output_stack,
					context: this.context
				});

				// Get children
				const edges = this.edges[node.id] || [];
				const children = edges.map(to => this.nodes[to]);

				if(!children.length) {
					this.final_nodes.add(node.id);
				}

				// Run all children
				return Promise.all(children.map(child => {
					return this.#run_lock({
						node: child,
						inputs: output
					});
				}));
			}).catch(e => {
				throw e;
			});
		}).catch(e => {
			// Explicitly show that we don't do anything with the error
			throw e;
		});
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
