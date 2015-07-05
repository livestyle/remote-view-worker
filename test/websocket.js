'use strict'

var assert = require('assert');
var ws = require('websocket');
var env = require('./assets/test-setup');

describe('WebSockets', function() {
	before(env.before);
	after(env.after);

	it('ping-pong', function(done) {
		var client = new ws.client();
		client.on('connect', function(connection) {
			var resp = [];
			connection.on('message', function(message) {
				resp.push(message.utf8Data);
				if (resp.length === 2) {
					assert.deepEqual(resp, ['pong', 'pong']);
					done();
				}
			});

			connection.send('ping');
			connection.send('ping');
		})
		.on('connectFailed', done);

		env.connect(function() {
			client.connect('ws://localhost:9001/', null, null, {'X-RV-Host': 'rv.livestyle.io'});
		});
	});
});