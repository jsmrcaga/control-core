#!/usr/bin/env node
const path = require('path');
const argumentate = require('argumentate');
const { bold, gray, red } = require('chalk');
const { Worker } = require('worker_threads');

// Config reader is separate because it will certainly
// be used elsewhere (ie: on the web configurator & runner)
const config_reader = require('./config-reader');
const { WorkerPool } = require('../worker/pool');

let { options, variables } = argumentate(process.argv.slice(2), {
	g: 'graphs', // configuration file for graph(s)
	c: 'config', // configuration (to handle CLI)
	o: 'output', // output file for every node output
	n: 'nodes', // nodes directory (will have to be improved soon)
	h: 'help', // display help dialog
	v: 'version', // display pakcage version
	t: 'threads', // max number of different threads to run (default is nb of CPUs available)
	r: 'respawn', // auto respawn dead threads
	i: 'idle', // max time (in ms) before killing idle threads (incompatible with respawn)
	p: 'plugins', // require Control Node plugins
	verbose: 'verbose', // should log verbose,
	renderer: 'renderer' // change from default renderer
});

// ex control --graphs graphs-file --nodes node-directory -o/--output file_to_write_outputs

if(options.version) {
	const pkg = require('../package.json');
	return console.log(`Control version v${pkg.version}`);
}

if(options.help) {
	console.log(`
${bold('Control')}

${gray('A simple library to handle flow automation and parallelism')}

Options:
    -g, --graphs	Path to the graph(s) configuration file (only JSON accepted)
    -c, --config	Configuration file (for graphs, local nodes and plugins)
    -o, --output	File to write output to (all nodes output)
    -n, --nodes		Directory to find custom nodes
    -t, --threads	Maximum number of threads
    -r, --respawn	If dead threads should automatically respawn
    -i, --idle		Maximum time a thread can be idle before killing it (incompatible with respawn)
    --verbose		Verbose logging
    --renderer		Path to a custom renderer
	`);

	return;
}

if(!options.renderer) {
	options.renderer = './renderer';
}

const Renderer = require(options.renderer);

if(options.output) {
	console.log('INFO: Output file is not yet supported\n');
}

// Read config from file
const required_config = config_reader({ filename: options.config });
// CLI options have higher priority
options = {...required_config, ...options};

let graphs = require(path.join(process.cwd(), options.graphs));
const nodes_dir = options.nodes ? path.join(process.cwd(), options.nodes) : [];

if(!Array.isArray(graphs)) {
	graphs = [graphs];
}

class ControlCLI {
	constructor() {
		this.worker_pool = new WorkerPool(options.threads || null, {
			max_idle_time: options.idle,
			respawn: options.respawn,
			verbose: options.verbose
		});

		this.tasks = {};
		this.renderer = null;

		this.time_start = null;
		this.time_end = null;

		this.cold_start = null;
		this.cold_end = null;
	}

	finish() {
		this.time_end = process.hrtime.bigint();
		this.worker_pool.kill().then(() => {
			this.renderer.finish({
				start: this.time_start,
				end: this.time_end,
				cold_start: this.cold_start,
				cold_end: this.cold_end
			});
			if(Object.values(this.tasks).some(({ status }) => status === 'error')) {
				return process.exit(1);
			}
			process.exit(0);
		}).catch(e => {
			console.error('FATAL', e);
		});
	}

	#check_finish() {
		const finishable_states = ['done', 'error'];
		if(Object.values(this.tasks).every(({ status }) => finishable_states.includes(status))) {
			this.finish();
		}
	}

	init() {
		// Get plugins
		const { plugins=[] } = options;

		this.cold_start = process.hrtime.bigint();
		this.worker_pool.init('./worker/worker', { nodes_dir, plugins }).then(() => {
			// workers initiated
			this.time_start = process.hrtime.bigint();
			this.cold_end = process.hrtime.bigint();

			for(const graph_config of graphs) {
				// Add task to worker_pool
				const { id: task_id } = this.worker_pool.run({ graph_config });
				this.tasks[task_id] = {
					graph_config,
					status: 'waiting'
				};
			}

			// Handle events to kill process
			this.worker_pool.on('task_start', ({ task_id, worker_id }) => {
				this.tasks[task_id].status = 'started';
				this.tasks[task_id].time = process.hrtime.bigint();
			});

			this.worker_pool.on('task_done', ({ task_id, worker_id }) => {
				this.tasks[task_id].status = 'done';
				this.tasks[task_id].end_time = process.hrtime.bigint();
				this.#check_finish();
			});

			this.worker_pool.on('task_error', ({ task_id, worker_id }) => {
				this.tasks[task_id].status = 'error';
				this.tasks[task_id].end_time = process.hrtime.bigint();
				this.#check_finish();
			});

			this.worker_pool.on('worker_error', ({ error, worker_id }) => {
				console.error(red('WORKER ERROR'), worker_id, '\n', error);
			});

			// Launch renderer
			this.renderer = new Renderer({
				tasks: this.tasks,
				graphs,
				options,
				variables,
			});

			this.renderer.init(this.worker_pool);
			
		}).catch(e => {
			console.error('FATAL:', e);
			process.exit(1);
		});
	}
}

const cli = new ControlCLI();
cli.init();
