// Worker needs to be generic
// Since it will also be used by "server/web" UIs
const { isMainThread, parentPort, workerData={} } = require('worker_threads');

const Control = require('../control');
const { StateMachine } = require('..//lib/mixins/mixins');
const { Task, TASK_STATES } = require('./task');

const NodeDiscovery = require('./lib/node-discovery');

// Worker steps:
// 1 - Register all node types
// 2 - Instanciate graph from config
// 3 - Run graph and transfer messages to parent thread
// 4 - finish and transfer output data to parent thread
// 5 - wait for next task (or die/be killed)

// If in main thread workerData is null
const { nodes_dir=[], plugins=[] } = workerData || {};

const STATES = {
	INIT: Symbol('INIT'),
	BUSY: Symbol('BUSY'),
	READY: Symbol('READY'),
};

const MESSAGE_TYPES = {
	NODE_STATE_CHANGED: 'node_state_changed',
	...TASK_STATES
};

class Message {
	constructor({ type, ...rest }) {
		if(!Object.values(MESSAGE_TYPES).includes(type)) {
			throw new Error(`Unknown message type: ${type}`);
		}

		this.type = type;
		for(const [k, v] of Object.entries(rest)) {
			this[k] = v;
		}
	}
}

class GraphWorker extends StateMachine {
	static TRANSITIONS = {
		[STATES.INIT]: [
			STATES.READY
		],
		[STATES.READY]: [
			STATES.BUSY
		],
		[STATES.BUSY]: [
			STATES.READY
		]
	};

	constructor() {
		super({
			initial_state: STATES.INIT
		});
		// Keeps track of current info in case
		// not ready
		this.task_queue = [];

		this.control = new Control();

		// On main thread parent port is null
		parentPort?.on('message', ({ task_id, payload: { graph_config=null }}={}) => {
			if(!graph_config) {
				throw new Error('Graph configuration is null');
			}

			this.task_queue.push({ graph_config, task_id });

			// Runs if tasks on queue
			this.pop();
		});
	}

	init({ nodes_dir, plugins }) {
		return NodeDiscovery.discover({ directories: nodes_dir, plugins }).then(nodes => {
			if(nodes?.length) {
				this.control.register(...nodes);
			}

			this.to(STATES.READY);
			this.pop();
		}).catch(e => {
			throw e;
		});
	}

	pop() {
		if(this.state !== STATES.READY) {
			return;
		}

		const queued_task = this.task_queue.shift();
		if(queued_task) {
			const { graph_config, task_id } = queued_task;
			this.run({
				graph_config,
				task_id
			});
		}
	}

	#message(type, data={}) {
		// on main thread parent port is null
		return parentPort?.postMessage({
			...data,
			type
		});
	}

	run({ graph_config, task_id }={}) {
		this.to(STATES.BUSY);

		if(!graph_config) {
			throw new Error('Empty graph_config received');
		}

		// Reset last run
		this.control.reset();

		this.#message(TASK_STATES.START, {
			task_id,
		})

		const { graph } = this.control.from_config(graph_config);

		// Every time a node changes state we warn our parent to
		// handle user UI / visualization
		graph.on('node_state_changed', ({ node, from, to }) => {
			this.#message(MESSAGE_TYPES.NODE_STATE_CHANGED, {
				task_id,
				node_id: node.id,
				graph_id: graph.name,
				from: from.toString(),
				to: to.toString()
			});
		});

		return graph.run().then(({ final_outputs, final_nodes, output_stack }) => {
			this.#message(TASK_STATES.DONE, {
				task_id,
				final_outputs,
				final_nodes,
				output_stack,
				graph_id: graph.name
			});

			this.to(STATES.READY);
			this.pop();
		}).catch(e => {
			this.#message(TASK_STATES.ERROR, {
				task_id,
				graph_config: graph.name,
				error: e
			})
		});
	}
}

const worker = new GraphWorker();
worker.init({ nodes_dir, plugins });
