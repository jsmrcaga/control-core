function is_node(cls, throws=false) {
	// We need it to be a constructor
	if(typeof cls !== 'function' || !cls.prototype) {
		if(throws) {
			throw new TypeError(`${cls.name} is not a valid node constructor: ${typeof cls}`);
		}

		return false;
	}

	// But if we require control-core twice, there will be two
	// (maybe identical) Node classes in the wild. isPrototypeOf will
	// not be enough

	const required_methods = ['execute', 'run'];
	for(const method of required_methods) {
		if(!(method in cls.prototype)) {
			if(throws) {
				throw new Error(`${cls.name} is missing ${method} in its prototype`);
			}

			return false;
		}

		for(const prefix of ['pre', 'post']) {
			const prefixed_method = `${prefix}_${method}`;
			if(!(prefixed_method in cls.prototype)) {
				if(throws) {
					throw new Error(`${cls.name} is missing ${prefixed_method} in its prototype`);
				}

				return false;
			}
		}
	}

	return true;
}

module.exports = {
	is_node
};
