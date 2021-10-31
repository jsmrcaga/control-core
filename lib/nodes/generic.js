const path = require('path');
const { Node } = require('./node');

class ScriptNode extends Node {
	static TYPE = 'script';

	#runnable = null;

	constructor(...args) {
		super(...args);
		if(!this.config.path) {
			throw new Error('Path is mandatory in script node config');
		}

		// read script file and cache it in instance
		const location = path.join(process.cwd(), this.config.path);
		this.#runnable = require(location);

		if(!(this.#runnable instanceof Function)) {
			throw new TypeError('Script must export a function');
		}
	}

	run({ inputs, outputs, context }) {
		// run script
		return this.#runnable({ inputs, outputs, context });
	}
}

class AssertionNode extends Node {
	static TYPE = 'generic-assertion';

	run({ inputs, outputs, context }) {

	}
}

class ErrorNode extends Node {
	static TYPE = 'generic-error';

	run({ inputs={} }) {
		const input_error = inputs?.error || null;
		console.log("INPUT ERROR", input_error);
		// True by default
		if(this.config.should_throw || input_error) {

			// Throw normal error if last node outputted an error
			if(input_error instanceof Error) {
				throw input_error;
			}

			throw new Error(input_error || this.config.error_message || 'Generic error');
		}
	}
}

class NoopNode extends Node {
	static TYPE = 'noop';

	run() {}
}

module.exports = {
	ScriptNode,
	AssertionNode,
	ErrorNode,
	NoopNode
};
