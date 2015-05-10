#!/usr/bin/env iojs
'use strict'

var net = require('net');
var http = require('http');
var debug = require('debug')('rv-worker');
var manager = require('./lib/session-manager');
var errorResponse = require('./lib/error-response');

// reverse tunner server
net.createServer(function(socket) {
	var session = manager.getSession(socket);
	if (session) {
		session.addSocket(socket);
	} else {
		// error: no session for given client
		debug('no session for socket');
		session.destroy();
	}
}).listen(9001, function() {
	debug('Created reverse tunnel server');
});

// http server
http.createServer(function(req, res) {
	debug('got HTTP request for %s', req.url);
	var session = manager.getSession(req);
	if (session) {
		session.redirect(req, res);
	} else {
		errorResponse(res, 'no-session');
	}
})
.on('upgrade', function(req, socket, head) {
	debug('got WebSocket request');
	var session = manager.getSession(req);
	if (session) {
		session.redirect(req, socket, head);
	} else {
		// TODO have to check if this really closes connection
		req.emit('close');
	}
})
.listen(9002, function() {
	debug('Created HTTP server');
});