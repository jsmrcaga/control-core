const { Node } = require('../../../../lib/nodes/node');

class RunnableNode extends Node {
	static TYPE = 'runnable';
	pre_run() {
		return true;
	}

	run() {
		return true;
	}

	post_run() {
		return;
	}
}

module.exports = RunnableNode;
