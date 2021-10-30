class SimpleEventEmitter {
	static ALLOWED_EVENTS = null;

	#events = {};

	on(event_name, cb) {
		const { ALLOWED_EVENTS } = this.constructor;
		if(ALLOWED_EVENTS && !ALLOWED_EVENTS.includes(event_name)) {
			throw new TypeError(`Unknown event ${event_name}`);
		}

		this.#events[event_name] = this.#events[event_name] || new Set();
		this.#events[event_name].add(cb);
	}

	removeEventListener(event_name, cb) {
		if(!this.#events[event_name]) {
			return false;
		}

		return this.#events[event_name].delete(cb);
	}

	getEventListeners(event_name) {
		return this.#events[event_name] || [];
	}

	emit(event_name, data) {
		if(!this.#events[event_name]) {
			return false;
		}

		for(const cb of this.#events[event_name]) {
			cb(data);
		}
	}
}

class StateMachine extends SimpleEventEmitter {
	// Ex:
	// {
	// 	'STATE1': [{
	// 		filter: (data) => data.name,
	// 		state: 'STATE2'
	// 	}],
	//
	// 	'STATE2': ['STATE3'],
	// }
	static TRANSITIONS = {};
	static ALLOWED_EVENTS = ['state_changed', 'state_reset'];
	static META_STATES = [];

	#state = null;

	constructor({ initial_state=null }) {
		super();
		this.#state = initial_state;
	}

	get #next_states() {
		const { TRANSITIONS } = this.constructor;
		return TRANSITIONS[this.#state];
	}

	#apply(state, event='state_changed') {
		const old_state = this.#state;
		this.#state = state;

		this.emit(event, {
			from: old_state,
			to: this.#state,
			target: this
		});

		return this.#state;
	}

	reset(state) {
		this.#apply(state, 'state_reset');
	}

	to(state, data) {
		const { META_STATES } = this.constructor;
		if(META_STATES.includes(state) || !this.#state) {
			return this.#apply(state);
		}

		const next = this.#next_states;
		if(!next) {
			throw new Error(`No transition from ${this.#state.toString()}`);
		}

		// TODO: normalize transitions before runtime
		const allowed = next.reduce((agg, val) => {
			if(val instanceof Object) {
				agg.add(val.state);
				return agg;
			}

			agg.add(val);
			return agg;
		}, new Set()).has(state);

		if(!allowed) {
			throw new TypeError(`Transition to state ${state.toString()} is not allowed from current state: ${this.#state.toString()}`);
		}

		const to = next.find(transition => {
			if(transition instanceof Object) {
				return transition.state === state;
			}

			return transition === state;
		});

		if(to instanceof Object && !to.filter(data)) {
			throw new Error(`Transition from ${this.#state.toString()} to ${state.toString()} does not match filter`);
		}

		return this.#apply(state);
	}

	get is_over() {
		return !this.#next_states;
	}

	get state() {
		return this.#state;
	}
}

module.exports = {
	SimpleEventEmitter,
	StateMachine
}
