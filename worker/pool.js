const os = require('os');
const { Worker } = require('worker_threads');
const { SimpleEventEmitter, StateMachine } = require('../lib/mixins/mixins');
const { Task, TASK_STATES } = require('./task');

const { green, gray, red, cyan, underline } = require('chalk');

const STATES = {
	IDLE: Symbol.for('IDLE'),
	BUSY: Symbol.for('BUSY'),
	ERROR: Symbol.for('ERROR'),
	EXITED: Symbol.for('EXITED'),
	STARTING: Symbol.for('STARTING'),
};

class PooledWorker extends StateMachine {
	static WORKER_STATES = STATES;

	static TRANSITIONS = {
		[STATES.STARTING]: [
			STATES.IDLE
		],
		[STATES.IDLE]: [
			STATES.BUSY
		],
		[STATES.BUSY]: [
			STATES.IDLE
		]
	};

	static META_STATES = [STATES.ERROR, STATES.EXITED];

	static ALLOWED_EVENTS = [
		'message',
		'exit',
		'error',
		'online',
		'task_done',
		'task_start',
		'task_error',
		...StateMachine.ALLOWED_EVENTS
	];

	#worker = null;
	#idle_timeout = null;

	get id() {
		if(!this.#worker) {
			return null;
		}

		return this.#worker.threadId;
	}

	constructor({ filename=null, max_idle_time=null, stdout=true, stdin=true }={}) {
		super({
			initial_state: STATES.STARTING
		});

		if(!filename) {
			throw new Error('Cannot instanciate worker without a filename');
		}

		this.filename = filename;

		this.max_idle_time = max_idle_time;

		this.stdout = stdout;
		this.stdin = stdin;

		// Manage max idle timing
		if(this.max_idle_time) {
			this.on('state_changed', ({ to }) => {
				if(to === STATES.IDLE) {
					this.#idle_timeout = setTimeout(() => {
						this.terminate();
					}, this.max_idle_time);
					return;
				}

				// We transition to another state
				clearTimeout(this.#idle_timeout);
				this.#idle_timeout = null;
			});
		}
	}

	init(workerData) {
		const worker = new Worker(this.filename, {
			workerData,
			stdout: this.stdout,
			stderr: this.stdin,
		});

		this.#worker = worker;

		worker.on('online', () => {
			this.to(STATES.IDLE);
			this.emit('online', {
				worker_id: this.id
			});
		});

		worker.on('message', message => {
			this.emit('message', {
				message,
				worker_id: this.id
			});

			if(!(message instanceof Object) || !message.type) {
				// For some reason worker sent an unknown message
				return;
			}

			const { type, task_id, ...rest } = message;

			if(type === TASK_STATES.DONE) {
				this.to(STATES.IDLE);
				return this.emit('task_done', {
					task_id,
					worker_id: this.id,
					...rest
				});
			}

			if(type === TASK_STATES.START) {
				this.to(STATES.BUSY);
				return this.emit('task_start', {
					task_id,
					worker_id: this.id,
					...rest
				});
			}

			if(type === TASK_STATES.ERROR) {
				// Task finished, go to idle
				this.to(STATES.IDLE);
				return this.emit('task_error', {
					task_id,
					worker_id: this.id,
					...rest
				});
			}
		});

		worker.on('error', (error) => {
			this.to(STATES.ERROR);
			this.emit('error', {
				error,
				worker_id: this.id
			});
		});

		worker.on('exit', (code) => {
			// Killing should be the pools work
			this.to(STATES.EXITED);
			this.emit('exit', {
				code,
				worker_id: this.id,
			});
		});

		return worker;
	}

	terminate() {
		return this.#worker.terminate();
	}

	run(task) {
		const { id, data } = task;
		this.#worker.postMessage({
			task_id: id,
			payload: data,
		});
	}
}

class WorkerPool extends SimpleEventEmitter {
	#workers = {};
	#queue = [];

	// Round robin starting index
	#rr_last_worker = -1;

	constructor(thread_nb, config={}) {
		super();
		// Config contains elements like
		// respawn
		// max_idle_time
		// verbose
		// debug (stdout for workers)
		this.config = config;

		this.log_level = config.verbose || null;

		this.thread_nb = thread_nb || os.cpus().length;
	}

	get #free_workers() {
		return Object.values(this.#workers).filter(worker => worker.state === STATES.IDLE);
	}

	get #worker_config() {
		const { max_idle_time, stdout, stdin } = this.config;
		return { max_idle_time, stdout, stdin };
	}

	get active_workers() {
		return Object.values(this.#workers).filter(worker => {
			return [STATES.IDLE, STATES.BUSY, STATES.STARTING].includes(worker.state)
		}).length;
	}

	#log(...args) {
		if(!this.log_level) {
			return;
		}

		return console.log(...args);
	}

	run(data) {
		const task = new Task(data);
		this.#queue.push(task);

		// Debounce to ensure for loops are treated correctly
		this.#pop();
		return task;
	}

	#round_robin() {
		this.#rr_last_worker += 1;

		if(!Object.values(this.#workers)[this.#rr_last_worker]) {
			this.#rr_last_worker = 0;
		}

		return Object.values(this.#workers)[this.#rr_last_worker];
	}

	#pop(worker) {
		// TODO better selection of nodes
		// for loop is faster than receiving messages
		// so we end up with the 1st worker getting all the tasks
		// Round robin selected for now
		if(!worker) {
			worker = this.#round_robin();
		}

		const task = this.#queue.shift();
		if(!task) {
			return;
		}

		worker.run(task);
	}

	terminate(id) {
		const pw = this.#workers[id];
		if(!pw) {
			return Promise.reject(new Error(`No worker with id ${id}`));
		}

		return pw.terminate().then(code => {
			delete this.#workers[pw.id];
			this.emit('worker_termination', {
				code
			});
		}).catch(e => {
			this.emit('termination_error', e);
		});
	}

	#init_one(file, worker_data) {
		const pw = new PooledWorker({...this.#worker_config, filename: file });
		pw.init(worker_data);

		// Task is done, worker is free
		pw.on('task_done', event => {
			// Run next queued task if any
			this.emit('task_done', event);
			this.#pop(pw);
		});

		pw.on('task_error', event => {
			// Run next queued task if any
			this.emit('task_error', event)
			// Task errored we can pop a new one
			this.#pop(pw);
		});

		// Simple proxy
		pw.on('task_start', event => {
			// Run next queued task if any
			this.emit('task_start', event);
		});

		// Simple proxy
		pw.on('message', event => {
			this.emit('worker_message', event);
		});

		// Simple proxy
		pw.on('error', event => {
			this.emit('worker_error', event);
			this.terminate(pw.id);
		});

		pw.on('exit', event => {
			this.emit('worker_exit', event);
			delete this.#workers[pw.id];

			if(this.config.respawn && event.code === 1) {
				this.#log(underline('Respawning'));
				this.#init_one(file, worker_data);
			}
		});

		this.#workers[pw.id] = pw;
		return pw;
	}

	init(file, worker_data, timeout=5000) {
		if(!file) {
			throw new Error('Worker File is required to init workers');
		}

		this.#log(cyan('Spawning threads'));

		return new Promise((resolve, reject) => {
			let done = this.thread_nb;

			// If workers are not online before timeout
			// kill already started workers
			const kill_timeout = setTimeout(() => {
				this.kill().then(() => {
					reject(new Error(`Timeout (${timeout}ms) reached while starting workers`));
				});
			}, timeout);

			for(let i = 0; i < this.thread_nb; i++) {
				const lob_nb = i + 1;
				this.#log(`Initializing thread (${gray(lob_nb)})...`);

				const pw = this.#init_one(file, worker_data);

				this.#log(`    ↪ Initialized thread (${gray(lob_nb)}): ${green(pw.id)}`);

				pw.on('online', () => {
					done--;

					this.emit('worker_online', {
						worker_id: pw.id,
						total_count: (this.thread_nb - done)
					});

					if(done === 0) {
						clearTimeout(kill_timeout);
						resolve(Object.values(this.#workers));
					}
				});
			}
		});
	}

	kill() {
		this.#log(red('\nTerminating all threads'));
		return Promise.all(Object.keys(this.#workers).map(id => {
			this.#log(`    ↪ Terminating thread: ${red(id)}`);
			return this.terminate(id);
		}));
	}
}

module.exports = { WorkerPool, PooledWorker, Task, TASK_STATES };
