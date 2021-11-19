const { expect } = require('chai');

const { template_value } = require('../../lib/mixins/template');

describe('Mixins - Template', () => {
	for(const str of ['${{plep}}', '${{ plep }}', '${{plep }}', '${{ plep}}', 'this ${{ plep }} is a test', '${{plep}} back', 'front ${{plep}}']) {
		it(`Should replace simple strings - "${str}"`, () => {
			expect(template_value(str, { plep: 'test-string' })).to.include('test-string');
		});
	}

	it('Should replace nested values', () => {
		expect(template_value('${{ nested.value }}', { nested: { value: 'test-string' }})).to.include('test-string');
		expect(template_value('${{ nested.value_w_underscore }}', { nested: { value_w_underscore: 'test-string' }})).to.include('test-string');
		expect(template_value('${{ nested.value }}', { nested: { something: 'test-string' }})).to.not.include('test-string');
		// Test not replaces
		expect(template_value('${{ nested.value }}', { nested: { something: 'test-string' }})).to.include('${{ nested.value }}');
	});

	it('Should not change initial object or initial data', () => {
		const config = {
			root: '${{ replace.me }}',
			obj: {
				test: '${{ replace.me }}',
				test2: '${{ replace.me }}'
			},
			arr: ['${{ replace.me }}', '${{ replace.me }}']
		};

		const initial_data = { replace: { me: 'test-string' }}

		const templated = template_value(config, initial_data);

		expect(templated === config).to.be.false;

		// Initial config
		expect(config.root).to.be.eql('${{ replace.me }}');
		expect(config.obj.test).to.be.eql('${{ replace.me }}');
		expect(config.obj.test2).to.be.eql('${{ replace.me }}');
		expect(config.arr[0]).to.be.eql('${{ replace.me }}');
		expect(config.arr[1]).to.be.eql('${{ replace.me }}');

		// Tempalted value
		expect(templated.root).to.be.eql('test-string');
		expect(templated.obj.test).to.be.eql('test-string');
		expect(templated.obj.test2).to.be.eql('test-string');
		expect(templated.arr[0]).to.be.eql('test-string');
		expect(templated.arr[1]).to.be.eql('test-string');

		// Initial data
		expect(initial_data.replace.me).to.be.eql('test-string');
	});
});
