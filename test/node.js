const { expect } = require('chai');
const Sinon = require('sinon');

const { Node, STATES } = require('../lib/nodes/node');

class TestNode extends Node {
	static TYPE = 'test_node';
}

describe('Node', () => {
	describe('Instanciation', () => {
		it('Should throw an error because no type is defined', () => {
			expect(() => new Node()).to.throw(TypeError, 'TYPE is mandatory');
		});

		it('Should throw an error because no id is passed', () => {
			expect(() => new TestNode()).to.throw(TypeError, 'id is mandatory');
		});

		it('Should instanciate correctly', () => {
			const node = new TestNode({ id: 54 });
			expect(node.id).to.be.eql(54);
			expect(node.name).to.be.eql('');
			expect(node.config).to.deep.equal({});
		})
	});

	describe('Prototype', () => {
		it('Should recognize other nodes as not executable', () => {
			const NotEither = 'plep';
			class NotANode {};
			class CloseNode {
				run() {}
				pre_run() {}
				post_run() {}
				execute() {}
				pre_execute() {}
			}

			expect(() => Node.isNode(NotEither, true)).to.throw(TypeError);
			expect(() => Node.isNode(NotANode, true)).to.throw(Error);
			expect(() => Node.isNode(CloseNode, true)).to.throw(Error);
		});

		it('Should recognize other nodes as being executable', () => {
			class Node2 {
				run() {}
				pre_run() {}
				post_run() {}
				execute() {}
				pre_execute() {}
				post_execute() {}
			}

			expect(Node.isNode(Node2)).to.be.true;
		});
	});

	describe('Pre execution', () => {
		it('Returns false and transitions to DID NOT RUN - Single value', () => {
			const node = new TestNode({ id: 34 });
			const stub = Sinon.stub(node, "pre_run");
			stub.returns(false);

			return node.pre_execute().then(() => {
				expect(node.state).to.be.eql(STATES.DID_NOT_RUN);
			});
		});

		it('Returns false and transitions to DID NOT RUN - Promise value', () => {
			const node = new TestNode({ id: 34 });
			const stub = Sinon.stub(node, "pre_run");
			stub.resolves(false);

			return node.pre_execute().then(() => {
				expect(node.state).to.be.eql(STATES.DID_NOT_RUN);
			});
		});

		it('Crashes and transitions to ERROR - Throw', done => {
			const node = new TestNode({ id: 34 });
			const stub = Sinon.stub(node, "pre_run");
			stub.throws(new Error('Test error'));

			node.pre_execute().catch(() => {
				expect(node.state).to.be.eql(STATES.ERROR);
				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Crashes and transitions to ERROR - Reject', done => {
			const node = new TestNode({ id: 34 });
			const stub = Sinon.stub(node, "pre_run");
			stub.rejects(new Error('Test error'));

			node.pre_execute().catch(() => {
				expect(node.state).to.be.eql(STATES.ERROR);
				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Once node is in DID_NOT_RUN it cannot be executed', () => {
			const node = new TestNode({ id: 34 });
			const stub = Sinon.stub(node, "pre_run");
			stub.returns(false);

			Sinon.stub(node, "run");

			return node.pre_execute().then(() => {
				expect(node.state).to.be.eql(STATES.DID_NOT_RUN);
				expect(() => node.execute()).to.throw(Error, 'No transition from');
			});
		});
	});

	describe('Execution', () => {
		it('Cannot execute if it has not been pre-executed', () => {
			const node = new TestNode({ id: 34 });
			expect(() => node.execute()).to.throw(Error, 'is not allowed');
		});

		it('Transitions to error if throws', done => {
			const node = new TestNode({ id: 34 });
			node.reset(STATES.PRE_EXECUTING);

			const stub = Sinon.stub(node, "run");
			stub.throws(new Error('RUN error'));

			node.execute().catch(e => {
				expect(node.state).to.be.eql(STATES.ERROR);
				done();
			}).catch(e => {
				done(e);
			});
		});
	});

	describe('Post execution', () => {
		it('Cannot post_run if not executed', () => {
			const node = new TestNode({ id: 34 });
			expect(() => node.post_execute()).to.throw(Error, 'is not allowed');
			node.reset(STATES.PRE_EXECUTING);
			expect(() => node.post_execute()).to.throw(Error, 'is not allowed');
		});

		it('Transitions to error if throws', done => {
			const node = new TestNode({ id: 34 });
			node.reset(STATES.EXECUTING);

			const stub = Sinon.stub(node, "post_run");
			stub.throws(new Error('Post-run error'));

			node.post_execute().catch(e => {
				expect(node.state).to.be.eql(STATES.ERROR);
				done();
			}).catch(e => {
				done(e);
			});
		});

		it('Transitions to success if no throws', done => {
			const node = new TestNode({ id: 34 });
			node.reset(STATES.EXECUTING);

			const stub = Sinon.stub(node, "post_run");

			node.post_execute().then(() => {
				expect(node.state).to.be.eql(STATES.SUCCESS);
				done();
			}).catch(e => {
				done(e);
			});
		});
	});
})
