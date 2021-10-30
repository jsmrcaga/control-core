const WorkerThreads = require('worker_threads');
const { SimpleEventEmitter } = require('../../lib/mixins/mixins');

class FakeWorker extends SimpleEventEmitter {
	constructor(filename, { workerData, ...config }) {
		super();
		this.filename = filename;
		this.config = config;
		this.workerData = workerData;
		this.threadId = (Math.random() * 0x100000).toString(16);
	}

	postMessage() {}

	terminate() {
		return Promise.resolve();
	}
}

const mock_worker = (clear_cache=[], fake_worker_cls=FakeWorker) => {
	for(const k of clear_cache) {
		// force reloading of module
		const total_path = require.resolve(k);
		delete require.cache[total_path];
	}

	// Replace worker Tthreads module
	require.cache['worker_threads'] = {
		exports: {
			...WorkerThreads,
			Worker: fake_worker_cls
		}
	};
};

const clear_mock = () => {
	delete require.cache['worker_threads'];
};

module.exports = {
	mock_worker,
	clear_mock,
	FakeWorker
};
