const sinon = require('sinon');
const os = require('os');
const { expect } = require('chai');

const { mock_worker, clear_mock, FakeWorker } = require('./worker-mock');

const { Task } = require('../../worker/task');

// Fake require to be able to mock node Worker
let PooledWorker = null;
let WorkerPool = null;

// Handle automatic online as a native
// Node worker would once started
class AutoOnlineFakeWorker extends FakeWorker {
	constructor(...args) {
		super(...args);
		// Emitting directly is too fast since
		// event listener is set right after
		setTimeout(() => {
			this.emit('online');
		}, 10);
	}
}

describe('Worker pool', () => {
	// Mock Nodejs Worker module
	before(() => {
		mock_worker(['../../worker/pool'], AutoOnlineFakeWorker);
		const { PooledWorker:PW, WorkerPool:WP } = require('../../worker/pool');
		PooledWorker = PW;
		WorkerPool = WP;
	});

	after(() => {
		clear_mock();
	});

	it('Should take cpu number as quantity if no quantity specified', () => {
		const pool = new WorkerPool();
		expect(pool.thread_nb).to.be.eql(os.cpus().length);
	});

	it('Should throw an error if no worker file is passed', () => {
		const pool = new WorkerPool();
		expect(() => pool.init()).to.throw(Error, 'Worker File is required');
	});

	it('Should be able to spawn multiple workers', done => {
		const pool = new WorkerPool(2);
		pool.init('plep', {}, 1000).then((workers) => {
			expect(pool.active_workers).to.be.eql(2);
			expect(workers.length).to.be.eql(2);
			expect(workers.every(w => w instanceof PooledWorker)).to.be.true;
			done();
		}).catch(e => done(e));
	});

	it('Kills workers if online is not emitted before timeout', done => {
		const pool = new WorkerPool(2);

		// Fake init to do nothing and force timeout to run
		const stub = sinon.stub(PooledWorker.prototype, 'init');
		stub.callsFake(() => {});

		const kill_stub = sinon.stub(pool, 'kill');
		kill_stub.resolves();

		pool.init('plep', {}, 100).then(() => {
			done(new Error('Resolved but waiting to catch'));
		}).catch(e => {
			expect(e.message.includes('Timeout (100ms) reached while starting workers')).to.be.true;

			// Restore global stub
			stub.restore();
			done();
		}).catch(e => done(e));
	});

	it('Kills all workers on kill()', done => {
		const pool = new WorkerPool(2);

		const stub = sinon.stub(PooledWorker.prototype, 'terminate');
		stub.resolves();

		pool.init('plep').then(() => {
			return pool.kill();
		}).then(() => {
			// 2 workers terminated
			expect(stub.callCount).to.be.eql(2);
			stub.restore();
			done();
		}).catch(e => done(e));
	});

	it('Registers all necessary events listeners on Pooled Workers', done => {
		const pool = new WorkerPool(1);
		pool.init('plp').then(([worker]) => {
			for(const event_name of ['task_done', 'task_error', 'task_start', 'message', 'error', 'exit', 'online']) {
				expect(worker.getEventListeners(event_name).size).to.be.eql(1);
			}
			done();
		}).catch(e => {
			done(e);
		});
	});

	it('Asks every worker to run a task', done => {
		const pool = new WorkerPool(4);

		const enumerate = function*(array) {
			let i = -1;
			for(const v of array) {
				i++;
				yield [v, i];
			}
			return;
		};

		// Stub to do nothing
		const stub = sinon.stub(PooledWorker.prototype, 'run');
		stub.callsFake(() => {});

		pool.init('plp').then(([worker]) => {
			for(const t of [1, 2, 3, 4]) {
				const task = pool.run(t);
				expect(task).to.be.instanceof(Task);
			}

			expect(stub.callCount).to.be.eql(4);
			const calls = stub.getCalls();
			const values = new Set([1, 2, 3, 4]);
			for(const call of calls) {
				const [arg] = call.args;
				expect(arg).to.be.instanceof(Task);
				expect(Array.from(values).includes(arg.data)).to.be.true;
				// remove value to check that next call
				// has been called with another task
				values.delete(arg.data);
			}

			done();
		}).catch(e => {
			done(e);
		});
	});
});
