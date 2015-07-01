'use strict';

var http = require('http');
var WebsocketServer = require('websocket').server;
var WebsocketClient = require('websocket').client;

var server = http.createServer()
.on('upgrade', function(req, socket) {
	console.log('got upgrade request');
	socket.on('close', function() {
		console.log('upgrade socket closed');
	});
});

server.listen(9003, function() {
	var ws = new WebsocketServer({
		httpServer: server,
		autoAcceptConnections: false
	});

	ws.on('request', function(req) {
		console.log('ws request received', req.origin);
		req.reject();
	});

	////// CLIENT
	var client = new WebsocketClient();
 	client.on('connectFailed', function(error) {
		console.log('Connect Error: ' + error.toString());
	});
 
	client.on('connect', function(connection) {
		console.log('WebSocket Client Connected');
		connection.on('error', function(error) {
			console.log("Connection Error: " + error.toString());
		});
		connection.on('close', function() {
			console.log('echo-protocol Connection Closed');
		});
		connection.on('message', function(message) {
			if (message.type === 'utf8') {
				console.log("Received: '" + message.utf8Data + "'");
			}
		});
	});
 
	client.connect('ws://localhost:9003/__livestyle__/');
});