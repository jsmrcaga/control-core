const fs = require('fs/promises');
const path = require('path');

const { Node } = require('../../lib/nodes/node');

const { ScriptNode, AssertionNode, ErrorNode } = require('../../lib/nodes/generic');

const arr = el => Array.isArray(el) ? el : [el];

/**
 * This class traverses different directories and modules (installed via a package manager)
 * in order to "discover" node types. This allows users to install pre-written nodes
 * as well as custom "this-project-only" nodes.
 * In the near future we will publish nodes for playwright for example, and could be used as a plugin
 */
class NodeDiscovery {
	static #read_file(directory, file) {
		let required = require(path.join(directory, file));
		if(!Array.isArray(required)) {
			required = [required];
		}

		return required.map(node => {
			if(Node.isPrototypeOf(node)) {
				return node;
			}

			// But not a Node
			// could be a module.exports = { MyNode1, MyNode2 }
			if(node instanceof Object) {
				return Object.values(node);
			}

			throw new Error(`Cannot read node file ${file}. Please export a node class, an array containing node classes or an object containing node classes`);
		}).flat();
	}

	static #read_plugin(plugin) {
		// Read directory from plugin
		const plugin_pkg = `${plugin}/package.json`;

		const plugin_json = require(plugin_pkg);
		const { control: { directory }} = plugin_json;

		const plugin_path = require.resolve(plugin_pkg).replace('/package.json', '')
		const plugin_nodes = path.join(plugin_path, directory);

		return this.#read_dir(plugin_nodes).flat(2);
	}

	static #read_plugins(plugins=[]) {
		if(!plugins?.length) {
			return Promise.resolve([]);
		}

		return Promise.all(plugins.map(plugin => this.#read_plugin(plugin)));
	}

	static #read_dir(directory) {
		return fs.readdir(directory).then(files => {
			// read each file
			const from_user = files.map(file => this.#read_file(directory, file)).flat(2);
			return [...from_user];
		});
	}

	static #read_dirs(directories=[]) {
		if(!directories?.length) {
			return Promise.resolve([]);
		}

		return Promise.all(directories.map(dir => this.#read_dir(dir)));
	}

	static discover({ directories=[], plugins=[] }) {
		directories = arr(directories);
		plugins = arr(plugins);

		// Standard nodes
		const std = [ScriptNode, AssertionNode, ErrorNode];

		if(!directories?.length && !plugins?.length) {
			return Promise.resolve([]);
		}

		const plugin_nodes = this.#read_plugins(plugins);
		const custom = this.#read_dirs(directories);

		return Promise.all([plugin_nodes, custom]).then(([plugins, custom]) => {
			// Plugins are arrays of arrays (multiple nodes in multiple files)
			return [...plugins.flat(), ...custom.flat(), ...std.flat()];
		});
	}
}

module.exports = NodeDiscovery;
