#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var http = require('http');
var net = require('net');
var transformHTTP = require('./lib/transform-http');
var through = require('through2');
var combine = require('./lib/http-body-combine');

function inject(code) {
	if (typeof code === 'string') {
		code = new Buffer(code);
	}

	var marker = new Buffer('</head>');
	var body = new Buffer('');
	var injected = false;
	var bodyTransform = through(function(chunk, enc, next) {
		if (injected) {
			// code already injected, simply pass through
			return next(null, chunk);
		}

		body = Buffer.concat([body, chunk]);
		let ix = body.indexOf(marker);
		if (ix !== -1) {
			// marker found, inject code
			body = Buffer.concat([body.slice(0, ix), code, body.slice(ix)]);

			// modify content-length of http header
			this.httpHeader.adjustContentLength(code.length);

			this.push(body);
			body = null
			injected = true;
		}

		next();
	}, function(next) {
		if (injected && body && body.length) {
			this.push(body);
		}
		next();
	});

	var uppercase = through(function(chunk, enc, next) {
		chunk = chunk.toString('utf8').toUpperCase();
		return next(null, new Buffer(chunk));
	});

	var replace = through(function(chunk, enc, next) {
		var header = this.httpHeader;
		chunk = chunk.toString('utf8').replace(/TEST/g, function() {
			header.adjustContentLength(-1);
			return 'foo';
		});

		return next(null, new Buffer(chunk));
	});

	return transformHTTP(combine(bodyTransform, uppercase, replace));
}

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
		.pipe(inject('<!-- injected!! -->'))
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