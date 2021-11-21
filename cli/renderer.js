const readline = require('readline');
const { green, red, cyan, gray, bold, underline } = require('chalk');

const NS_PER_SEC = 1e9;

class Renderer {
	constructor({ options, variables, graphs, tasks }) {
		this.options = options;
		this.variables = variables;
		this.tasks = tasks;
		this.graphs = graphs;

		this.errors = {};

		this.pre_render();
	}

	log(...args) {
		return console.log(...args);
	}

	pre_render() {
		// Tracks cli line for every grpah in order to re-write it when needed
		this.graph_lines = {};

		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true
		});

		if(this.options.title) {
			this.log(`
  _____          __           __
 / ___/__  ___  / /________  / /
/ /__/ _ \\/ _ \\/ __/ __/ _ \\/ /
\\___/\\___/_//_/\\__/_/  \\___/_/

-------------------------------
			`);
		}
	}

	draw_groups() {

	}

	#_draw_graph(graph) {
		// Track
		const { row } = this.rl.getCursorPos();
		this.graph_lines[graph.id] = row;

		// Draw
	}

	draw_graph(graph) {
		const line = null;
	}

	init(worker_pool) {
		const { tasks } = this;

		worker_pool.on('task_done', ({ task_id, worker_id }) => {
			this.log(tasks[task_id].graph_config.name, green('DONE'), gray(`on worker ${worker_id}`));
		});

		worker_pool.on('task_error', ({ task_id, worker_id, error, node_errors }) => {
			const { name } = tasks[task_id].graph_config;
			if(node_errors) {
				error.node_errors = node_errors;
			}

			this.log(name, red('ERROR'), gray(`on worker ${worker_id}`));
			this.errors[name] = error;
		});
	}

	finish({ start, end, cold_start, cold_end }) {
		if(!Object.keys(this.errors).length) {
			return;
		}

		const task_timing = start && end ? parseInt(end - start) / NS_PER_SEC : null;
		const cold_timing = cold_start && cold_end ? parseInt(cold_end - cold_start) / NS_PER_SEC : null;

		if(task_timing) {
			this.log(gray('\nDone in'), task_timing, gray('seconds'));
		}

		if(cold_timing){
			this.log(gray('Cold startup took'), cold_timing, gray('seconds'));
		}

		if(cold_timing && task_timing) {
			this.log(gray(bold('Total:')), bold(task_timing + cold_timing), gray('seconds'));
		}


		this.log('\n============', red('ERRORS'), '============');
		for(const [graph, err] of Object.entries(this.errors)) {
			this.log(gray(underline('Graph:')), bold(graph));
			if(err.node_errors?.length) {
				for(const node_error of err.node_errors) {
					this.log('\n');
					this.log(node_error);
				}
			} else {
				this.log(err);
			}
			this.log('--------------------------------');
		}
	}
}

module.exports = Renderer;
