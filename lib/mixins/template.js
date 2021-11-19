function replace_values(str, data={}) {
	// Just in case
	if(typeof str !== 'string') {
		return str;
	}

	const reg = /\$\{\{\s*(?<key>[a-zA-Z0-9\.\_\-]+)\s*\}\}/g;
	const replaceable = str.matchAll(reg);

	for(const to_replace of replaceable) {
		const { groups: { key }} = to_replace;
		const template_string = to_replace[0]; // ex: ${{ something.something_else }}
		
		const final_value = key.split('.').reduce((current_obj, k) => current_obj[k], data);

		// If no final value is found we can skip it
		if(final_value === undefined) {
			continue;
		}

		// Escape to ake i
		str = str.replace(template_string, final_value);
	}

	return str;
}

function template_value(value, data={}) {
	if(Array.isArray(value)) {
		// Will check if it's object or string and do the magic, and replace every value inside
		return value.map(item => template_value(item, data));
	}

	if(value instanceof Object) {
		// Recursive between two functions to template objects
		return template_object(value, data);
	}

	if(typeof value !== 'string') {
		return value;
	}

	return replace_values(value, data);
}

function template_object(value, data={}) {
	// Traverse every key top-down and replace value
	// Create new object to prevent replacing the original
	const new_obj = {...value};
	for(const k in new_obj) {
		new_obj[k] = template_value(new_obj[k], data);
	}

	// Return new value
	return new_obj;
}

function make_node_config({ inputs, initial_inputs, env, outputs, context }, config) {
	// Small optimization
	if(!config || !Object.keys(config).length){
		return config;
	}

	/*
	// Hierarchy of inheritance explanation
	// -----
	* environment comes before config, you could deploy a new config on an old machine
	* config comes before node initial_inputs, since initial_inputs
		are "runtime" values, and could override the "static" config
	* all node outputs come after initial_inputs because outputs
		are runtime values calculated _during_ the flow
	* inputs come after outputs because they are
		are runtime values calculated _right before_ this node needs to run
		and they could pontentially decide to change something on the run
	*/
	const any = {
		...env,
		...config,
		...initial_inputs,
		...outputs,
		...inputs
	};

	const new_config = template_value(config, {
		any,
		env,
		config,
		inputs,
		initial_inputs,
		outputs,
		context
	});

	return new_config;
};

module.exports = {
	template_value,
	template_object,
	make_node_config
};
