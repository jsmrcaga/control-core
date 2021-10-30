const { expect } = require('chai');
const { StateMachine } = require('../../lib/mixins/mixins');

class TestStateMachine extends StateMachine {
	static META_STATES = ['STATE_0'];
	static TRANSITIONS = {
		'STATE_0': ['STATE_1'],
		'STATE_2': [{
			state: 'STATE_3',
			filter: (data) => data.allow
		}, {
			state: 'STATE_6',
			filter: ({ only6 }={}) => only6
		}],
		'STATE_3': ['STATE_4', 'STATE_5']
	};
}

describe('StateMachine', () => {
	it('Instanciates with an initial state', () => {
		const sm = new StateMachine({ initial_state: 'INITIAL_STATE' });
		expect(sm.state).to.be.eql('INITIAL_STATE');
	});

	it('Allows to travel to the next possible states on a simple transition', () => {
		const sm = new TestStateMachine({ initial_state: 'STATE_0' });
		const result = sm.to('STATE_1');
		expect(sm.state).to.be.eql('STATE_1');
		expect(result).to.be.eql('STATE_1');
	});

	it('Allows to travel to a meta state from a non-transition state', () => {
		const sm = new TestStateMachine({ initial_state: 'STATE_5' });
		const result = sm.to('STATE_0');
		expect(sm.state).to.be.eql('STATE_0');
		expect(result).to.be.eql('STATE_0');
	});

	it('Does not allow to travel to a state because of missing transition', () => {
		// Array
		const sm = new TestStateMachine({ initial_state: 'STATE_3' });
		expect(() => {
			sm.to('STATE_1');
		}).to.throw(TypeError, 'is not allowed from');

		// Objects
		const sm2 = new TestStateMachine({ initial_state: 'STATE_2' });
		expect(() => {
			sm2.to('STATE_5');
		}).to.throw(TypeError, 'is not allowed from');
	});

	it('Is (not) over', () => {
		const sm = new TestStateMachine({ initial_state: 'STATE_3' });
		expect(sm.is_over).to.be.false;
		sm.to('STATE_4');
		expect(sm.is_over).to.be.true;
	});

	it('Does not allow direct transition because of filter', () => {
		const sm = new TestStateMachine({ initial_state: 'STATE_2' });
		expect(() => {
			sm.to('STATE_6');
		}).to.throw(Error, 'does not match filter');

		expect(() => {
			sm.to('STATE_6', { plep: 45 });
		}).to.throw(Error, 'does not match filter');

		expect(() => {
			sm.to('STATE_6', { only6: false });
		}).to.throw(Error, 'does not match filter');

		expect(() => {
			sm.to('STATE_3', { only6: true });
		}).to.throw(Error, 'does not match filter');

		expect(() => {
			sm.to('STATE_3', { allow: false });
		}).to.throw(Error, 'does not match filter');
	});

	it('Allows direct transition matching filter', () => {
		const sm = new TestStateMachine({ initial_state: 'STATE_2' });
		expect(sm.to('STATE_6', { only6: true })).to.be.eql('STATE_6');

		const sm2 = new TestStateMachine({ initial_state: 'STATE_2' });
		expect(sm2.to('STATE_3', { allow: true })).to.be.eql('STATE_3');
	});
});
