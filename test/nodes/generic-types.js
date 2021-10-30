const { expect } = require('chai');

const { ScriptNode } = require('../../lib/nodes/generic');

describe('Generic Nodes', () => {
	describe('Script node', () => {
		it('Crases if no path in config', () => {
			expect(() => {
				const node = new ScriptNode({ id: 1 });
			}).to.throw(Error, 'Path is mandatory');
		});

		it('Instanciates correctly and requires a runnable', () => {
			const node = new ScriptNode({
				id: 1,
				config: {
					path: './test/nodes/test-script'
				}
			});

			// Depends on the test-script file
			const result = node.run({
				inputs: {
					value: 4
				}
			});
			expect(result).to.be.eql(8);
		});

		it('Crashes if exported script is not a function', () => {
			expect(() => {
				const node = new ScriptNode({
					id: 1,
					config: {
						path: './test/nodes/test-wrong-script'
					}
				});
			}).to.throw(TypeError, 'Script must export a function');
		});
	});
});
