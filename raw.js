#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var http = require('http');
var net = require('net');
var transformHTTP = require('./lib/transform-http');
var through = require('through2');

// server
net.createServer(function(socket) {
	console.log('received HOST connection');
	var remote = net.connect({port: 9002}, function() {
		socket
		.pipe(transformHTTP({
			host: 'emmet.io',
			connection: 'close'
		}))
		.pipe(remote, {end: false})
		.pipe(through(function(chunk, enc, next) {
			this.push(new Buffer(chunk.toString().replace('Test', 'HELO')));
			next();
		}))
		.pipe(socket);
	});
}).listen(9001, function() {
	console.log('Created server on 9001');
});

// remote client
net.createServer(function(socket) {
	console.log('received REMOTE connection');
	var data = new Buffer('');
	var headerEnd = new Buffer('\r\n\r\n');
	var complete = false;

	socket.on('data', function(chunk) {
		data = Buffer.concat([data, chunk]);
		if (!complete && data.indexOf(headerEnd) !== -1) {
			console.log('got request');
			console.log(data.toString());
			complete = true;
			let output = '<html><head><title>Test</title></head><body><b>Done!!</b>!!</body></html>';
			this.end(new Buffer([
				`HTTP/1.1 200 ${http.STATUS_CODES[200]}`,
				`Content-Length: ${output.length}`,
				`Content-Type: text/html`,
				`Connection: close`,
				'',
				output
			].join('\r\n')));
		}
	})
	.on('close', function() {
		console.log('socket closed');
	});
}).listen(9002, function() {
	console.log('Created server on 9002');
});