#!/usr/bin/env iojs --es-staging --harmony_arrow_functions
'use strict'

var net = require('net');
var bouncy = require('bouncy');
var debug = require('debug')('rv-worker');
var session = require('./lib/session');
var errorResponse = require('./lib/error-response');

// socket server
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
	debug('Created socket server');
});

// http server
bouncy(function(req, res, bounce) {
	debug('got request for %s', req.headers.host + req.url);

	var s = session(req);
	if (s) {
		s.redirect(req, res, bounce);
	} else {
		errorResponse(res, 'no-session');
	}
}).listen(9002, function() {
	debug('Created HTTP server');
});