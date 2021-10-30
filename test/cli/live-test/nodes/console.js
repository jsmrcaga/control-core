const { Node } = require('../../../../lib/nodes/node');

class ConsoleNode extends Node {
	static TYPE = 'console';
	run() {
		console.log(this.config.log);
	}
}

module.exports = { ConsoleNode };
