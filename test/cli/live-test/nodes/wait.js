const { Node } = require('../../../../lib/nodes/node');

class WaitingNode extends Node {
	static TYPE = 'wait';
	pre_run() {
		return true;
	}

	run() {
		const { wait_time } = this.config;
		return new Promise(resolve => {
			setTimeout(() => resolve(), wait_time);
		});
	}

	post_run() {
		return;
	}
}

module.exports = WaitingNode;
