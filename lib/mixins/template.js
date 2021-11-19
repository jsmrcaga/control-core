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

module.exports = {
	template_value,
	template_object
};
