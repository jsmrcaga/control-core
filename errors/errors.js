class OverrideError extends Error {}

class GraphError extends Error {
	constructor(message, errors) {
		super(message);

		// Errors are { node_id, error }
		this.errors = errors;
	}
}

module.exports = {
	OverrideError,
	GraphError
};
