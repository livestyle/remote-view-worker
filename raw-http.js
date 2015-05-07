#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var http = require('http');
var net = require('net');
var through = require('through2');
var transformStream = require('./lib/transform-stream');
var transformer = require('./lib/transformer');
const CRLF = '\r\n';

http.createServer(function(req, res) {
	console.log('HTTP request');
	var header = transformStream.createHTTPRequestHeader(req, {
		'host': 'emmet.io',
		'x-forwarded-proto': 'http',
		'connection': 'close'
	}); 
	console.log(header);
	var socket = net.connect({port: 9002}, function() {
		socket.write(new Buffer(header));

		req.pipe(socket)
		.pipe(transformStream(req, res))
		.pipe(transformer(function(chunk, enc, next) {
			var injected = new Buffer('injected');
			chunk = new Buffer(chunk.toString().toUpperCase());
			this.contentLength += injected.length;
			this.push(injected);
			this.push(chunk);
			next();
		}))
		.pipe(res);
	});
}).listen(9001, function() {
	console.log('Created HTTP server on 9001');
});

http.createServer(function(req, res) {
	console.log('Proxy request');
	console.log(transformStream.createHTTPRequestHeader(req));
	res.end('Proxy complete');
}).listen(9002, function() {
	console.log('Created socket server on 9002');
});