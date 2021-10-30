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

	run() {
		throw new Error(this.config.error_message);
	}
}

module.exports = {
	ScriptNode,
	AssertionNode,
	ErrorNode
};
