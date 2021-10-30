const { expect } = require('chai');

describe('Export index', () => {
	it('Shoudl export everything', () => {
		const exported = require('../index');
		const _exports = [
			'Control',
			'Node',
			'Edge',
			'Graph',
			'ScriptNode',
			'AssertionNode',
			'ErrorNode',
			'NoopNode',
			'SimpleEventEmitter',
			'StateMachine',
			'WorkerPool',
			'PooledWorker',
			'Task',
			'NodeDiscovery',
			'TASK_STATES'
		];

		for(const k of _exports) {
			expect(exported[k]).is.not.undefined;
			expect(exported[k]).is.not.null;
		}
	});
})
