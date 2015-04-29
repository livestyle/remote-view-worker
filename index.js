#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var net = require('net');
var bouncy = require('bouncy');

var sockets = [];

// socket server
net.createServer(function(client) {
	console.log('client connected');
	sockets.push(client);

	client.on('end', function() {
		console.log('client disconnected')
		var ix = sockets.indexOf(client);
		if (ix !== -1) {
			sockets.splice(ix, 1);
		}
	});
}).listen(9001, function() {
	console.log('Created socket server');
});

// http server
bouncy(function(req, bounce) {
	console.log('got request for', req.url);
	if (sockets.length) {
		console.log('bouncing...');
		bounce(sockets[0]);
	} else {
		console.error('no available sockets');
	}
}).listen(9002, function() {
	console.log('Created HTTP server');
});