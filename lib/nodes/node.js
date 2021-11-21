const { OverrideError } = require('../../errors/errors');
const { StateMachine } = require('../mixins/mixins');
const { is_node } = require('../mixins/is-node');

const STATES = {
	BACKPROPAGATION_ERROR: Symbol.for('BACKPROPAGATION_ERROR'),
	WAITING_FOR_DONE: Symbol.for('WAITING_FOR_DONE'),
	POST_EXECUTING: Symbol.for('POST_EXECUTING'),
	PRE_EXECUTING: Symbol.for('PRE_EXECUTING'),
	DID_NOT_RUN: Symbol.for('DID_NOT_RUN'),
	EXECUTING: Symbol.for('EXECUTING'),
	SUCCESS: Symbol.for('SUCCESS'),
	ERROR: Symbol.for('ERROR'),
	IDLE: Symbol.for('IDLE'),
};

const FINAL_STATES = [
	STATES.SUCCESS,
	STATES.ERROR,
	STATES.IDLE,
	STATES.DID_NOT_RUN
];

const promisify = (p) => p instanceof Promise ? p : Promise.resolve(p);

class Node extends StateMachine {
	static STATES = STATES;

	static TYPE = null;

	static META_STATES = [STATES.ERROR, STATES.IDLE, STATES.BACKPROPAGATION_ERROR];
	static TRANSITIONS = {
		[STATES.IDLE]: [
			STATES.PRE_EXECUTING,
		],
		[STATES.PRE_EXECUTING]: [
			STATES.EXECUTING,
			STATES.DID_NOT_RUN
		],
		[STATES.EXECUTING]: [
			STATES.POST_EXECUTING,
			STATES.WAITING_FOR_DONE
		],
		[STATES.POST_EXECUTING]: [
			STATES.SUCCESS,
			STATES.WAITING_FOR_DONE
		],
		[STATES.WAITING_FOR_DONE]: [
			STATES.SUCCESS,
		]
	};

	constructor({ id, name='', description='', config={} } = {}){
		super({ initial_state: STATES.IDLE });

		if(!this.constructor.TYPE) {
			throw new TypeError('Node TYPE is mandatory');
		}

		if(id === '' || [undefined, null].includes(id)) {
			throw new TypeError('id is mandatory');
		}

		this.id = id;
		this.name = name;
		this.description = description;
		this.config = config;
		this.runs = 0;
	}

	get is_async() {
		// Tells the graph that this node does something, and then waits for future
		// events before being "done". Allows us to create asynchronous nodes.
		// For example: nodes that react to event listeners

		// We test for run.length to match Mocha's API
		// ex: run(params)       => length = 1
		// ex: run(params, done) => length = 2
		return this.run.length === 2;
	}

	#promisify(callback) {
		// Takes a callback and executes it
		// If a crash happens we transition to error
		// and we "throw" again to be caught later
		try {
			const result = callback();
			const promise = promisify(result);
			return promise.catch(e => {
				this.to(STATES.ERROR);
				throw e;
			});
		} catch(e) {
			this.to(STATES.ERROR);
			return Promise.reject(e);
		}
	}

	// before execution
	pre_execute({ inputs, outputs, context, config, parent_id } = {}) {
		this.to(STATES.PRE_EXECUTING);
		this.runs++;
		return this.#promisify(() => (
			this.pre_run({ inputs, outputs, context, config, parent_id })
		)).then(result => {
			if(result === false) {
				this.to(STATES.DID_NOT_RUN);
			}

			return result;
		});
	}

	pre_run({ inputs, outputs, context, config, parent_id } = {}) {
		return true;
	}

	// Actual execution
	// using ...rest allows us to have function length of 1 but still pass
	// done to run
	execute({ inputs, outputs, context, config, parent_id } = {}, ...rest) {
		this.to(STATES.EXECUTING);
		return this.#promisify(() => (
			this.run({ inputs, outputs, context, config, parent_id }, ...rest)
		));
	}

	run() {
		throw new OverrideError('run must be overriden');
	}

	// Post execution
	post_execute({ inputs, outputs, context, config, parent_id } = {}) {
		this.to(STATES.POST_EXECUTING);
		return this.#promisify(() => (
			this.post_run({ inputs, outputs, context, config, parent_id })
		)).then((result) => {
			if(this.is_async) {
				this.to(STATES.WAITING_FOR_DONE);
			} else {
				this.to(STATES.SUCCESS);
			}
			return result;
		});
	}

	post_run({ inputs, outputs, context, config, parent_id } = {}) {
		return true;
	}

	static isNode(cls, throws=false) {
		// If we are in the same module and the cls extends ourselves
		// we can be fairly certain that cls is a node
		if(this.isPrototypeOf(cls)) {
			return true;
		}

		return is_node(cls, throws);
	}
}

class Edge {
	constructor({ from, to, label=null}) {
		this.from = from;
		this.to = to;
		this.label = null;
	}
}

module.exports = {
	Edge,
	Node,
	STATES,
	FINAL_STATES
};
