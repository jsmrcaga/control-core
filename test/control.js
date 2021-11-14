const { expect } = require('chai');
const { Node, STATES } = require('../lib/nodes/node');
const { Graph } = require('../lib/graph');

const Control = require('../control');

class TestNode extends Node {
	static TYPE = 'test-node';
}

class TestNode2 extends Node {
	static TYPE = 'test-node-2';
}

class TestNode3 extends Node {
	static TYPE = 'test-node-3';
}

class RunnableNode extends Node {
	static TYPE = 'run'

	pre_run() {
		return true;
	}

	run() {
		return this.config.ret;
	}

	post_run() {
		return true;
	}
}

class NoTypeNode extends Node {}

class NotANode {}

describe('Control', () => {
	describe('Node Registration', () => {
		it('Registers a new node', () => {
			const TestControl = new Control();
			TestControl.register(TestNode);
			expect(TestControl.nodes).to.have.property('test-node');
		});

		it('Registers multiple new nodes', () => {
			const TestControl = new Control();
			TestControl.register(TestNode, TestNode2, TestNode3);
			expect(TestControl.nodes).to.have.property('test-node');
			expect(TestControl.nodes).to.have.property('test-node-2');
			expect(TestControl.nodes).to.have.property('test-node-3');
		});

		it('Throws because of unknown node Type', () => {
			const TestControl = new Control();
			expect(() => {
				TestControl.register(NoTypeNode);
			}).to.throw(TypeError, 'Node TYPE is mandatory');
		});

		it('Throws because of not a subclass of Node', () => {
			const TestControl = new Control();
			expect(() => {
				TestControl.register(NotANode);
			}).to.throw(Error, 'missing');
		});

		it('Throws because of existing node Type', () => {
			const TestControl = new Control();
			TestControl.register(TestNode);
			expect(() => {
				TestControl.register(TestNode);
			}).to.throw(Error, 'already registered');
		});
	});

	describe('Generates a graph from configuration', () => {
		it('Crashes because of unknown node type', () => {
			const TestControl = new Control();
			TestControl.register(TestNode, TestNode2, TestNode3);
			expect(() => {
				TestControl.from_config({
					id: 51,
					name: 'MyGraph',
					nodes: [{
						type: 'chicken',
						id: 43,
						config: { test: 45 }
					}],
					edges: []
				});
			}).to.throw(TypeError, 'Unknown node type');
		});

		it('Instanciates a graph from simple configuration', () => {
			const TestControl = new Control();
			TestControl.register(TestNode, TestNode2, TestNode3);

			// 1 -> 2 -> F
			//  \ -> 3 -> 4 -> 5 -> X
			const { graph } = TestControl.from_config({
				id: 3,
				name: 'MyGraph',
				nodes: [
					{
						id: 1,
						type: 'test-node',
					},{
						id: 2,
						type: 'test-node-2',
					},{
						id: 'F',
						type: 'test-node-3',
					},{
						id: 3,
						type: 'test-node',
					},{
						id: 4,
						type: 'test-node-2',
					},{
						id: 5,
						type: 'test-node-3',
					},{
						id: 'X',
						type: 'test-node',
					}
				],
				edges: [
					{ from: 1, to: 2 },
					{ from: 2, to: 'F' },
					{ from: 1, to: 3 },
					{ from: 3, to: 4 },
					{ from: 4, to: 5 },
					{ from: 5, to: 'X' },
				]
			});

			for(const p of [1, 2, 3, 4, 5, 'X','F']) {
				expect(graph.nodes).to.have.property(p);
			}

			expect(graph.edges[1]).to.have.length(2);
			expect(graph.edges[2]).to.have.length(1);
			expect(graph.edges['F']).to.be.undefined;

			expect(graph.edges[3]).to.have.length(1);
			expect(graph.edges[4]).to.have.length(1);
			expect(graph.edges[5]).to.have.length(1);
			expect(graph.edges['X']).to.be.undefined;
		});

		it('Runs a simple graph', done => {
			const TestControl = new Control();
			TestControl.register(RunnableNode);

			// 1 -> 2
			//  \ -> 3
			TestControl.from_config({
				id: 67,
				name: 'MyGraph',
				nodes: [
					{
						id: 1,
						type: 'run',
						config: {
							ret: 'Node1RAN'
						}
					},{
						id: 2,
						type: 'run',
						config: {
							ret: 'Node2RAN'
						}
					},{
						id: 3,
						type: 'run',
						config: {
							ret: 'Node3RAN'
						}
					}
				],
				edges: [
					{ from: 1, to: 2 },
					{ from: 1, to: 3 },
				]
			});

			TestControl.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(final_nodes.size).to.be.eql(2);
				expect(final_nodes.has(2)).to.be.true;
				expect(final_nodes.has(3)).to.be.true;

				expect(output_stack).to.have.property(1);
				expect(output_stack).to.have.property(2);
				expect(output_stack).to.have.property(3);

				expect(final_outputs).to.not.have.property(1);
				expect(final_outputs[2]).to.be.eql('Node2RAN');
				expect(final_outputs[3]).to.be.eql('Node3RAN');
				done();
			}).catch(e => {
				done(e);
			});
		});
	});
});
