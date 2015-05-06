#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var net = require('net');
var http = require('http');
var debug = require('debug')('rv-worker');
var session = require('./lib/session');
var errorResponse = require('./lib/error-response');

// reverse tunner server
net.createServer(function(socket) {
	debug('socket connected');
	var s = session(socket);
	if (s) {
		s.addSocket(socket);
	} else {
		// error: no session for given client
		debug('no session for socket');
		s.destroy();
	}
}).listen(9001, function() {
	debug('Created reverse tunnel server');
});


// http server
net.createServer(function(socket) {
	debug('got HTTP request');
	var s = session(socket);
	if (s) {
		s.redirect(socket);
	} else {
		errorResponse(socket, 'no-session');
	}
}).listen(9002, function() {
	debug('Created HTTP server');
});