const { SimpleEventEmitter } = require('./mixins/mixins');
const { Node, Edge, STATES } = require('./nodes/node');

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
				node_id: target.id
			});
		};

		Object.values(this.nodes).forEach(node => {
			node.on('state_changed', listener);
		});
	}

	#stack({ node_id, output }) {
		const new_stack = {...this.output_stack};
		new_stack[node_id] = output;
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
		return this.run_node({
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
					return this.run_node({
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

	static build({ name='', nodes=[], edges=[], context={} }) {
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
		const root_nodes = Object.values(nodes_by_id).filter(({ id }) => {
			return !to.includes(id);
		});

		if(root_nodes.length > 1) {
			throw new Error('Multiple root nodes found, cannot build graph tree');
		}

		const [root] = root_nodes;

		return new Graph({
			name,
			root,
			edges,
			context,
			nodes: nodes_by_id,
		});
	}
}

module.exports = { Graph };
