const { OverrideError } = require('../../errors/errors');
const { StateMachine } = require('../mixins/mixins');

const STATES = {
	PRE_EXECUTING: Symbol('PRE_EXECUTING'),
	POST_EXECUTING: Symbol('POST_EXECUTING'),
	DID_NOT_RUN: Symbol('DID_NOT_RUN'),
	EXECUTING: Symbol('EXECUTING'),
	SUCCESS: Symbol('SUCCESS'),
	ERROR: Symbol('ERROR'),
	IDLE: Symbol('IDLE'),
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

	static META_STATES = [STATES.ERROR, STATES.IDLE];
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

		if(!id) {
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
	pre_execute({ inputs, outputs, context } = {}) {
		this.to(STATES.PRE_EXECUTING);
		this.runs++;
		return this.#promisify(() => (
			this.pre_run({ inputs, outputs, context })
		)).then(result => {
			if(result === false) {
				this.to(STATES.DID_NOT_RUN);
			}

			return result;
		});
	}

	pre_run({ inputs, outputs, context } = {}) {
		return true;
	}

	// Actual execution
	execute({ inputs, outputs, context } = {}) {
		this.to(STATES.EXECUTING);
		return this.#promisify(() => (
			this.run({ inputs, outputs, context })
		));
	}

	run({ inputs, outputs, context } = {}) {
		throw new OverrideError('run must be overriden');
	}

	// Post execution
	post_execute({ inputs, outputs, context } = {}) {
		this.to(STATES.POST_EXECUTING);
		return this.#promisify(() => (
			this.post_run({ inputs, outputs, context })
		)).then((result) => {
			this.to(STATES.SUCCESS);
			return result;
		});
	}

	post_run({ inputs, outputs, context } = {}) {
		return true;
	}

	static isNode(cls, throws=false) {
		// If we are in the same module and the cls extends ourselves
		// we can be fairly certain that cls is a node
		if(this.isPrototypeOf(cls)) {
			return true;
		}

		// We need it to be a constructor
		if(typeof cls !== 'function' || !cls.prototype) {
			if(throws) {
				throw new TypeError(`${cls.name} is not a valid node constructor: ${typeof cls}`);
			}

			return false;
		}

		// But if we require control-core twice, there will be two
		// (maybe identical) Node classes in the wild. isPrototypeOf will
		// not be enough

		const required_methods = ['execute', 'run'];
		for(const method of required_methods) {
			if(!(method in cls.prototype)) {
				if(throws) {
					throw new Error(`${cls.name} is missing ${method} in its prototype`);
				}

				return false;
			}

			for(const prefix of ['pre', 'post']) {
				const prefixed_method = `${prefix}_${method}`;
				if(!(prefixed_method in cls.prototype)) {
					if(throws) {
						throw new Error(`${cls.name} is missing ${prefixed_method} in its prototype`);
					}

					return false;
				}
			}
		}

		return true;
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
