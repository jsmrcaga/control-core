const { Graph } = require('./lib/graph');
const { Node, Edge } = require('./lib/nodes/node');

class Control {
	constructor() {
		this.nodes = {};
		this.graph = null;
	}

	register(...node_classes){
		for(const node_cls of node_classes) {
			this.#register_one(node_cls);
		}
	}

	#register_one(node_cls) {
		// Check if class is node and raise if needed
		Node.isNode(node_cls, true);

		const { TYPE } = node_cls;
		if(!TYPE) {
			throw new TypeError('Node TYPE is mandatory');	
		}

		if(this.nodes[TYPE]) {
			throw new Error(`Node type ${TYPE} already registered`);
		}

		this.nodes[TYPE] = node_cls;
	}

	reset() {
		// Resets graph (Garbage collector will do some magic)
		// But keeps nodes in cache
		this.graph = null;
	}

	from_config({ id, name, nodes, edges }) {
		// Reset graph
		this.reset();

		if(!id) {
			throw new Error('Graph id is mandatory');
		}

		if(!nodes || !nodes.length) {
			throw new Error('Cannot build graph without nodes');
		}

		if(!edges) {
			throw new Error('Cannot build graph without edges');
		}

		// ex: node: { id, config, type, ...rest }
		// ex: edge: { from, to, label }
		const instanciated_nodes = nodes.map(node => {
			const node_cls = this.nodes[node.type];
			if(!node_cls) {
				throw new TypeError(`Unknown node type: ${node.type}`);
			}

			return new node_cls({ ...node });
		});

		const instanciated_edges = edges.map(edge => new Edge({...edge}));

		const graph = Graph.build({
			id,
			name,
			nodes: instanciated_nodes,
			edges: instanciated_edges
		});

		this.graph = graph;

		return this;
	}

	run() {
		return this.graph.run();
	}
}

module.exports = Control;
