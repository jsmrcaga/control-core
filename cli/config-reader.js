const path = require('path');

module.exports = ({ filename }) => {
	if(!filename) {
		// Empty config
		return {};
	}

	const config_file = filename ? path.join(process.cwd(), filename) : null;

	let required_config = require(config_file);
	if(required_config instanceof Function) {
		required_config = required_config();
	}
	
	return required_config;
};
