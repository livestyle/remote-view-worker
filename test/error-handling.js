var assert = require('assert');
var net = require('net');
var env = require('./assets/test-setup');

describe.skip('Error handling', function() {
	before(env.before);
	after(function() {
		process.nextTick(env.after);
	});

	it('corrupted HTTP request', function(done) {
		var socket = env.connect();
		env.session.once('error', function(err) {
			console.log('got error');
			done();
		});

		var conn = net.connect(9002, function() {
			var lines = [
				'GET / HTTP/1.1',
				'Accept-Encoding: gzip',
				'\r\n'
			];			
			conn.write(lines.join('\r\n'));
		});
	});
});