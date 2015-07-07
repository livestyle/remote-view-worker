'use strict'

var http = require('http');
var assert = require('assert');
var ws = require('websocket');
var env = require('./assets/test-setup');
var WebSocketServer = require('websocket').server;
var WebSocketClient = require('websocket').client;
var LiveStyleConnector = require('remote-view-client').LiveStyleConnector;

describe('LiveStyle Connector', function() {
	var ws;
	var localUrl = 'ws://localhost:54009/livestyle';
	var remoteUrl = 'ws://localhost:9001/session-test';

	before(function(done) {
		env.before(function() {
			// setup fake LiveStyle server
			var server = http.createServer();
			ws = new WebSocketServer({
				httpServer: server,
				autoAcceptConnections: true
			});
			ws.server = server;
			server.listen(54009, done);
		});
	});
	after(function(done) {
		env.after(function() {
			ws.shutDown();
			ws.server.close(done);
		});
	});

	function sendMessage(name, data) {
		ws.broadcast(JSON.stringify({name, data}));
	}

	it('establish connection', function(done) {
		var ls = new LiveStyleConnector(localUrl, remoteUrl, function() {
			var messageCount = 0;
			var messageNames = [];
			var messageURIs = [];
			// a fake client connected to LiveStyle messaging channel
			new WebSocketClient()
			.once('connect', function(connection) {
				connection.on('message', function(message) {
					messageCount++;
					var payload = JSON.parse(message.utf8Data);
					messageNames.push(payload.name);
					messageURIs.push(payload.data.uri);
				});

				// this message is ok
				sendMessage('diff', {
					uri: 'http://localhost:9999/style/main.css',
					patches: [{foo: 'bar'}]
				});

				// unsupported name
				sendMessage('foo');
				
				// unmatched origin
				sendMessage('diff', {uri: 'http://localhost:8888/style/main.css'});

				setTimeout(function() {
					assert.equal(messageCount, 1);
					assert.deepEqual(messageNames, ['diff']);
					// resource URI must be rewritten to match RV publicId
					assert.deepEqual(messageURIs, ['http://rv.livestyle.io/style/main.css']);
					done()
				}, 70);
			})
			.once('connectFailed', function(err) {
				console.log('connection failed!');
				console.log(err.stack);
				done(err);
			})
			.connect('ws://localhost:9001/__livestyle__/', null, null, {
				'X-RV-Host': 'rv.livestyle.io'
			});
		});
	});
});