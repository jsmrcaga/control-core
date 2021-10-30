// Strings because they are sent between threads and master process
const TASK_STATES = {
	START: 'task_start',
	DONE: 'task_done',
	ERROR: 'task_error'
};

const rid = () => (Math.random() * 0x10000000).toString(16);

class Task {
	constructor(data) {
		this.data = data;
		this.id = rid();
	}
}

module.exports = {
	Task,
	TASK_STATES
};
