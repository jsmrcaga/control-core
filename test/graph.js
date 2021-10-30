const { expect } = require('chai');
const Sinon = require('sinon');

const { Node, STATES } = require('../lib/nodes/node');
const { Graph } = require('../lib/graph');

class TestNode extends Node {
	static TYPE = 'TEST_NODE';
}

class RunnableNode extends Node {
	static TYPE = 'RUNNABLE_NODE';
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

describe('Graph', () => {
	describe('Build', () => {
		it('Builds a straight graph from nodes', () => {
			const node1 = new TestNode({ id: 1 });
			const graph = Graph.build({
				nodes: [
					node1,
					new TestNode({ id: 2 }),
					new TestNode({ id: 3 }),
				],
				edges: [{
					from: 1,
					to: 2
				}, {
					from: 2,
					to: 3
				}]
			});

			expect(graph.root.id).to.be.eql(1);
			for(const p of [1, 2, 3]) {
				expect(graph.nodes).to.have.property(p);
			}

			expect(graph.nodes[1]).to.be.eql(node1);

			for(const p of [1, 2]) {
				expect(graph.edges).to.have.property(p);
			}
		});

		it('Builds a multi-branch graph from nodes', () => {
			const node1 = new TestNode({ id: 1 });
			const graph = Graph.build({
				nodes: [
					node1,
					new TestNode({ id: 2 }),
					new TestNode({ id: 3 }),
					new TestNode({ id: 4 }),
				],
				edges: [{
					from: 1,
					to: 2
				}, {
					from: 2,
					to: 3
				},{
					from: 2,
					to: 4
				}]
			});

			expect(graph.edges[1]).to.have.length(1);
			expect(graph.edges[2]).to.have.length(2);
		});

		it('Applied node listeners correctly', done => {
			const node1 = new TestNode({ id: 1 });
			const graph = Graph.build({
				nodes: [
					node1,
				],
				edges: []
			});

			// Will be called twice but done() will stop the process
			// Maybe if we manage to parallelize execution later this test will
			// have to be revised.
			// IDLE -> PRE_EXECUTING
			// PRE_EXECUTING -> DID_NOT_RUN | ERROR
			graph.on('node_state_changed', ({ node, from, to }) => {
				expect(node).to.be.eql(node1);
				expect(from).to.be.eql(STATES.IDLE);
				expect(to).to.be.eql(STATES.PRE_EXECUTING);
				done();
			});

			// Will trigger state change and should re-emit to node_state_changed
			node1.pre_execute();
		});

		it('Throws if multiple roots are found', () => {
			const build = () => {
				const graph = Graph.build({
					nodes: [
						new TestNode({ id: 1 }),
						new TestNode({ id: 2 }),
						new TestNode({ id: 3 }),
						new TestNode({ id: 4 }),
					],
					edges: [{
						from: 1,
						to: 2
					}, {
						from: 3,
						to: 4
					}]
				});
			};

			expect(build).to.throw(Error, 'Multiple root nodes found');
		});
	});

	describe('Run', () => {
		it('Runs a single node', done => {
			const node1 = new RunnableNode({ id: 1, config: { ret: 'Yay!' } });
			const graph = Graph.build({
				nodes: [node1]
			});

			graph.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(final_nodes.has(1)).to.be.true;
				expect(final_outputs).to.have.property(1);
				expect(final_outputs[1]).to.be.eql('Yay!');
				expect(output_stack).to.have.property(1);
				expect(output_stack[1]).to.be.eql('Yay!');

				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Runs a 2-node graph', done => {
			const node1 = new RunnableNode({ id: 1, config: { ret: 'Return 1' } });
			const node2 = new RunnableNode({ id: 2, config: { ret: 'Something else'} });

			const graph = Graph.build({
				nodes: [node1, node2],
				edges: [{ from: 1, to: 2 }]
			});

			graph.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(final_nodes.has(2)).to.be.true;
				expect(final_outputs).to.have.property(2);
				expect(final_outputs[2]).to.be.eql('Something else');

				expect(output_stack).to.have.property(1);
				expect(output_stack).to.have.property(2);
				expect(output_stack[1]).to.be.eql('Return 1');
				expect(output_stack[2]).to.be.eql('Something else');

				expect(node1.state).to.be.eql(STATES.SUCCESS);
				expect(node2.state).to.be.eql(STATES.SUCCESS);

				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Stops running a 2-node graph', done => {
			const node1 = new RunnableNode({ id: 1, config: { ret: 'Return 1' } });
			const stub = Sinon.stub(node1, 'pre_run');
			stub.returns(false);

			const node2 = new RunnableNode({ id: 2, config: { ret: 'Something else'} });

			const graph = Graph.build({
				nodes: [node1, node2],
				edges: [{ from: 1, to: 2 }]
			});

			graph.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(final_nodes.size).to.be.eql(0);
				expect(Object.keys(final_outputs)).to.have.length(0)
				expect(Object.keys(output_stack)).to.have.length(0);

				expect(node1.state).to.be.eql(STATES.DID_NOT_RUN);
				expect(node2.state).to.be.eql(STATES.IDLE);
				
				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Runs a multi-leaf graph', done => {
			const node1 = new RunnableNode({ id: 1, config: { ret: 'Return 1' } });
			const node2 = new RunnableNode({ id: 2, config: { ret: 'Something else'} });
			const node3 = new RunnableNode({ id: 3, config: { ret: 'Final countdown'} });

			// 1 -> 2
			//  \-> 3
			const graph = Graph.build({
				nodes: [node1, node2, node3],
				edges: [{ from: 1, to: 2 }, { from: 1, to: 3 }]
			});

			graph.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(final_nodes.has(2)).to.be.true;
				expect(final_nodes.has(3)).to.be.true;
				expect(final_outputs).to.have.property(2);
				expect(final_outputs).to.have.property(3);
				expect(final_outputs[2]).to.be.eql('Something else');
				expect(final_outputs[3]).to.be.eql('Final countdown');

				expect(output_stack).to.have.property(1);
				expect(output_stack).to.have.property(2);
				expect(output_stack).to.have.property(3);
				expect(output_stack[1]).to.be.eql('Return 1');
				expect(output_stack[2]).to.be.eql('Something else');
				expect(output_stack[3]).to.be.eql('Final countdown');

				expect(node1.state).to.be.eql(STATES.SUCCESS);
				expect(node2.state).to.be.eql(STATES.SUCCESS);
				expect(node3.state).to.be.eql(STATES.SUCCESS);
				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Stops execution from a branch', done => {
			const node1 = new RunnableNode({ id: 1, config: { ret: 'Return 1' } });
			const node2 = new RunnableNode({ id: 2, config: { ret: 'Something else'} });
			const node3 = new RunnableNode({ id: 3, config: { ret: 'Final countdown'} });
			const node4 = new RunnableNode({ id: 4, config: { ret: 'Never here'} });
			const nodeF = new RunnableNode({ id: 'F', config: { ret: 'Never here'} });

			const stub = Sinon.stub(node3, 'pre_run');
			stub.returns(false);

			// 1 -> 2 -> 'F'
			//  \-> 3(x) -> 4
			const graph = Graph.build({
				nodes: [node1, node2, node3, node4, nodeF],
				edges: [
					{ from: 1, to: 2 },
					{ from: 1, to: 3 },
					{ from: 3, to: 4 },
					{ from: 2, to: 'F' }
				]
			});

			graph.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(final_nodes.has('F')).to.be.true;
				expect(final_nodes.has(4)).to.be.false;

				expect(final_outputs).to.have.property('F');
				expect(final_outputs).to.not.have.property(4);
				expect(output_stack).to.not.have.property(4);

				expect(node1.state).to.be.eql(STATES.SUCCESS);
				expect(node2.state).to.be.eql(STATES.SUCCESS);
				expect(nodeF.state).to.be.eql(STATES.SUCCESS);
				expect(node3.state).to.be.eql(STATES.DID_NOT_RUN);
				expect(node4.state).to.be.eql(STATES.IDLE);
				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Allows nodes to modify context', done => {
			const node1 = new RunnableNode({ id: 1, config: { ret: 'Return 1' } });
			const node2 = new RunnableNode({ id: 2, config: { ret: 'Something else'} });
			const node3 = new RunnableNode({ id: 3, config: { ret: 'Final countdown'} });

			const stub_1 = Sinon.stub(node1, 'run');
			stub_1.callsFake(({ context }) => {
				context.current_value += 7; // goes to 12
			});

			const stub_2 = Sinon.stub(node2, 'run');
			stub_2.callsFake(({ context }) => {
				context.current_value += 10; // goes to 22
			});

			const stub_3 = Sinon.stub(node3, 'run');
			stub_3.callsFake(({ context }) => {
				context.current_value /= 2; // goes to 11
			});

			// 1 -> 2
			//  \-> 3
			const graph = Graph.build({
				nodes: [node1, node2, node3],
				edges: [{ from: 1, to: 2 }, { from: 1, to: 3 }],
				context: {
					current_value: 5
				}
			});

			graph.run().then(({ final_outputs, output_stack, final_nodes }) => {
				expect(node1.state).to.be.eql(STATES.SUCCESS);
				expect(node2.state).to.be.eql(STATES.SUCCESS);
				expect(node3.state).to.be.eql(STATES.SUCCESS);

				expect(graph.context.current_value).to.be.eql(11);
				done();
			}).catch(e => {
				done(e);
			});
		});
	});
});
