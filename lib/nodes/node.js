const { OverrideError } = require('../../errors/errors');
const { StateMachine } = require('../mixins/mixins');
const { is_node } = require('../mixins/is-node');

const STATES = {
	BACKPROPAGATION_ERROR: Symbol.for('BACKPROPAGATION_ERROR'),
	PRE_EXECUTING: Symbol.for('PRE_EXECUTING'),
	POST_EXECUTING: Symbol.for('POST_EXECUTING'),
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
			STATES.POST_EXECUTING
		],
		[STATES.POST_EXECUTING]: [
			STATES.SUCCESS
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
	pre_execute({ inputs, outputs, context, config, parent_id, fail } = {}) {
		this.to(STATES.PRE_EXECUTING);
		this.runs++;
		return this.#promisify(() => (
			this.pre_run({ inputs, outputs, context, config, parent_id, fail })
		)).then(result => {
			if(result === false) {
				this.to(STATES.DID_NOT_RUN);
			}

			return result;
		});
	}

	pre_run({ inputs, outputs, context, config, parent_id, fail } = {}) {
		return true;
	}

	// Actual execution
	execute({ inputs, outputs, context, config, parent_id, fail } = {}) {
		this.to(STATES.EXECUTING);
		return this.#promisify(() => (
			this.run({ inputs, outputs, context, config, parent_id, fail })
		));
	}

	run({ inputs, outputs, context, config, parent_id, fail } = {}) {
		throw new OverrideError('run must be overriden');
	}

	// Post execution
	post_execute({ inputs, outputs, context, config, parent_id, fail } = {}) {
		this.to(STATES.POST_EXECUTING);
		return this.#promisify(() => (
			this.post_run({ inputs, outputs, context, config, parent_id, fail })
		)).then((result) => {
			this.to(STATES.SUCCESS);
			return result;
		});
	}

	post_run({ inputs, outputs, context, config, parent_id, fail } = {}) {
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
