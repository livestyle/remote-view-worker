#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var http = require('http');
var net = require('net');
var through = require('through2');
var httpParser = require('./lib/http-parser');

const CRLF = '\r\n';

http.createServer(function(req, res) {
	console.log('HTTP request');
	console.log(createHTTPHeader(req));
	var socket = net.connect({port: 9002}, function() {
		socket.write(new Buffer(createHTTPHeader(req)));

		var httpHeader = null;
		var parser = httpParser.response(function(result) {
			console.log('got parser result', result);
			httpHeader = result;
		});

		req.pipe(socket).pipe(through(function(chunk, enc, next) {
			if (!httpHeader) {
				let ret = parser.execute(chunk);
				// let ret2 = parser.execute(chunk.slice(100));
				console.log('chunk is %d bytes', chunk.length);
				console.log(chunk.toString());
				// console.log('parser ret', ret, ret2);
			}
			next(null, chunk);
		})).pipe(res.socket);

	});
}).listen(9001, function() {
	console.log('Created HTTP server on 9001');
});

http.createServer(function(req, res) {
	console.log('Proxy request');
	console.log(createHTTPHeader(req));
	res.end('Proxy complete');
}).listen(9002, function() {
	console.log('Created socket server on 9002');
});

function createHTTPHeader(req) {
	var lines = [req.method + ' ' + req.url + ' HTTP/' + req.httpVersion];
	for (var i = 0; i < req.rawHeaders.length; i+=2) {
		lines.push(req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1]);
	}

	lines.push(CRLF);
	return lines.join(CRLF);
}