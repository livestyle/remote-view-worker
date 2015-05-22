'use strict'


var assert = require('assert');
var ws = require('websocket');
var env = require('./assets/test-setup');

describe('WebSockets', function() {
	before(env.before);
	after(env.after);

	it('ping-pong', function(done) {
		env.connect();
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
		});
		client.connect('ws://localhost:9001/');

	});
});