const sinon = require('sinon');
const { expect } = require('chai');
const { TASK_STATES } = require('../../worker/task');

const { mock_worker, clear_mock } = require('./worker-mock');

let PooledWorker = null;

describe('Pooled Worker', () => {
	before(() => {
		// Mock nodejs native worker
		mock_worker(['../../worker/pool']);

		// Require after mocking worker threads class
		const { PooledWorker:PW } = require('../../worker/pool');
		PooledWorker = PW;
	});

	after(() => {
		// Clear our Worker mock
		clear_mock();
	});

	it('Should require a filename when instanciating a pooled worker', () => {
		expect(() => {
			const pw = new PooledWorker();
		}).to.throw(Error, 'Cannot instanciate worker without a filename');
	});

	it('Should set an event listener when instanciating with max_idle_time', () => {
		const pw = new PooledWorker({
			filename: 'plep',
			max_idle_time: 50_000
		});

		// .size because it's a set
		expect(pw.getEventListeners('state_changed').size).to.be.eql(1);
	});

	it('Should launch a worker and register event listeners', () => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init({
			a: 1,
			b: 2
		});

		expect(worker).to.not.be.undefined;
		expect(worker.filename).to.be.eql('plep');
		expect(worker.workerData).to.deep.eql({ a: 1, b: 2 });
		for(const event_name of ['online', 'message', 'error', 'exit']) {
			expect(worker.getEventListeners(event_name).size).to.be.eql(1);
		}
	});

	it('Should transition to idle and proxy-emit when worker comes online', done => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();

		pw.on('online', event => {
			expect(event.worker_id).to.be.eql(worker.threadId);
			expect(pw.state).to.be.eql(PooledWorker.WORKER_STATES.IDLE);
			done();
		});

		worker.emit('online');
	});

	it('Should transition to error and proxy-emit on worker error', done => {
				const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();

		const err = new Error('Some error');

		pw.on('error', event => {
			expect(event.worker_id).to.be.eql(worker.threadId);
			expect(event.error).to.be.eql(err);
			expect(pw.state).to.be.eql(PooledWorker.WORKER_STATES.ERROR);
			done();
		});

		worker.emit('error', err);
	});

	it('Should transition to exited and proxy-emit on worker exit', done => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();

		pw.on('exit', event => {
			expect(event.worker_id).to.be.eql(worker.threadId);
			expect(event.code).to.be.eql(5);
			expect(pw.state).to.be.eql(PooledWorker.WORKER_STATES.EXITED);
			done();
		});

		worker.emit('exit', 5);
	});

	it('Should proxy a random message', done => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();
		pw.on('message', ({ message, worker_id }) => {
			expect(worker_id).to.be.eql(worker.threadId);
			expect(message).to.be.eql('Some message');
			done();
		});

		worker.emit('message', 'Some message');
	});


	it('Should transition to IDLE once worker emits TASK.DONE and emit task_done', done => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();
		pw.on('task_done', ({ task_id, worker_id }) => {
			expect(worker_id).to.be.eql(worker.threadId);
			expect(task_id).to.be.eql(34);
			expect(pw.state).to.be.eql(PooledWorker.WORKER_STATES.IDLE);
			done();
		});

		// We need to simulate worker going online if
		// we want other transitions to be possible
		worker.emit('online');

		// We can't transition to IDLE if worker is IDLE already
		pw.reset(PooledWorker.WORKER_STATES.BUSY);

		worker.emit('message', {
			type: TASK_STATES.DONE,
			task_id: 34
		});
	});

	it('Should transition to BUSY once worker emits TASK.START and emit task_start', done => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();
		pw.on('task_start', ({ task_id, worker_id }) => {
			expect(worker_id).to.be.eql(worker.threadId);
			expect(task_id).to.be.eql(34);
			expect(pw.state).to.be.eql(PooledWorker.WORKER_STATES.BUSY);
			done();
		});

		// We need to simulate worker going online if
		// we want other transitions to be possible
		worker.emit('online');

		worker.emit('message', {
			type: TASK_STATES.START,
			task_id: 34
		});
	});

	it('Should emit task_error once worker emits TASK.ERROR', done => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();

		const err = new Error('Some error');

		pw.on('task_error', ({ task_id, worker_id, error }) => {
			expect(worker_id).to.be.eql(worker.threadId);
			expect(task_id).to.be.eql(34);
			expect(error).to.be.eql(err);
			done();
		});

		// We need to simulate worker going online if
		// we want other transitions to be possible
		worker.emit('online');
		// We can't transition to IDLE if worker is IDLE already
		pw.reset(PooledWorker.WORKER_STATES.BUSY);

		worker.emit('message', {
			type: TASK_STATES.ERROR,
			task_id: 34,
			error: err
		});
	});

	it('Should post a message with task_id and payload to start a task', () => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();

		// We need to simulate worker going online if
		// we want other transitions to be possible
		worker.emit('online');

		const stub = sinon.stub(worker, 'postMessage');

		pw.run({
			id: 54,
			data: {
				do: 'somehthing'
			}
		});

		expect(stub.calledOnce).to.be.true;
		const { firstCall: { args } } = stub;
		const [arg] = args;
		expect(arg).to.deep.eql({
			task_id: 54,
			payload: {
				do: 'somehthing'
			}
		});
	});

	it('Should call terminate on Worker if terminate is called', () => {
		const pw = new PooledWorker({
			filename: 'plep'
		});

		const worker = pw.init();

		// We need to simulate worker going online if
		// we want other transitions to be possible
		worker.emit('online');

		const stub = sinon.stub(worker, 'terminate');

		pw.terminate();
		expect(stub.calledOnce).to.be.true;
	});
});
