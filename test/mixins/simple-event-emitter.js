const { expect } = require('chai');
const { SimpleEventEmitter } = require('../../lib/mixins/mixins');
const Sinon = require('sinon');

class AllowedEE extends SimpleEventEmitter {
	static ALLOWED_EVENTS = ['event-one', 'event-two'];
}

describe('SimpleEventEmitter', () => {
	it('Should register any type of events', () => {
		const see = new SimpleEventEmitter();
		see.on('test-event', () => {});
	});

	it('Should return false when no event exists (remove or emit)', () => {
		const see = new SimpleEventEmitter();
		const result = see.emit('test-data', {});
		expect(result).to.be.false;

		const result_remove = see.removeEventListener('test-data2', {});
		expect(result_remove).to.be.false;
	});

	it('Should register and call a callback', () => {
		const callback = Sinon.stub();
		const see = new SimpleEventEmitter();
		see.on('test-event', callback);

		see.emit('test-event');

		expect(callback.calledOnce).to.be.true;
	});

	it('Should register and unregister a callback', () => {
		const callback = Sinon.stub();
		const see = new SimpleEventEmitter();
		see.on('test-event', callback);

		see.emit('test-event');
		expect(callback.calledOnce).to.be.true;

		see.removeEventListener('test-event', callback);
	});

	describe('Allowed events only', () => {
		it('Should register and call a callback', () => {
			const callback = Sinon.stub();
			const see = new AllowedEE();
			see.on('event-one', callback);

			see.emit('event-one');
			expect(callback.calledOnce).to.be.true;
		});

		it('Should not register an event because it\'s unknown', () => {
			const callback = Sinon.stub();
			const see = new AllowedEE();
			expect(() => {
				see.on('event-three', callback);
			}).to.throw(TypeError, 'Unknown event');

			see.emit('event-three');
			expect(callback.callCount).to.be.eql(0);
		});
	});
});
