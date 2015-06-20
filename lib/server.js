'use strict';

var http = require('http');
var debug = require('debug')('rv:server');
var extend = require('xtend');
var sessionManager = require('./session-manager');
var errorResponse = require('./error-response');

var openedSockets = [];
var defaultOptions = {
	port: 9001
};

module.exports = function(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	options = extend({}, defaultOptions, options || {});

	var server = http.createServer(function(req, res) {
		debug('got request %s %s', req.method, req.url);
		// errorResponse(res, 'no-session');
		sessionManager.getSession(req).then(
			_sessionRedirect.bind(null, req, res), 
			_errNoSessionForRequest.bind(null, req, res)
		);
	})
	.on('connect', function(req, socket, head) {
		var sessionId = req.url.replace(/^\/*|\/*$/g, '');
		debug('requested tunnel connection for session %s', sessionId);
		storeSocket(socket);
		sessionManager.getSession(sessionId).then(
			addSocketToSession.bind(socket), 
			_errNoSessionForSocket.bind(socket)
		);
	})
	.on('upgrade', function(req, socket, head) {
		debug('got WebSocket request');
		storeSocket(socket);
		sessionManager.getSession(req).then(function(session) {
			socket.websocket = true;
			session.addSocket(socket);
			session.redirect(req, socket, head);
		}, function() {
			socket.destroy();
		});
	});
	server.listen(options.port, function() {
		debug('running RV worker on %d', options.port);
		if (typeof callback === 'function') {
			callback.call(server);
		}
	});
	server.options = options;
	server.destroy = function(fn) {
		debug('shutting down rv server');
		while (openedSockets.length) {
			openedSockets.pop().destroy();
		}
		this.close(fn);
	}
	return server;
};

function storeSocket(socket) {
	if (openedSockets.indexOf(socket) === -1) {
		openedSockets.push(socket);
		socket.once('close', removeSocket);
	}
}

function removeSocket(socket) {
	var ix = openedSockets.indexOf(socket || this);
	if (ix !== -1) {
		openedSockets.splice(ix, 1);
	}
}

function addSocketToSession(session) {
	this.unref();
	this.setTimeout(5000);
	this.once('data', function() {
		// wait until tunnel sends first chunk: it means it is
		// connected to requested server and ready for tunneling
		debug('tunnel ready');
		this.setTimeout(0);
		this.removeListener('timeout', onSocketTimeout);
		session.addSocket(this);
	})
	.once('timeout', onSocketTimeout)
	.write(
		'HTTP/1.1 200 Connection Established\r\n' +
		`X-RV-Host: ${session.data.localSite}\r\n` +
		'\r\n'
	);
}

function onSocketTimeout() {
	this.end();
	this.destroy();
}

function _sessionRedirect(req, res, session) {
	session.redirect(req, res);
};

function _errNoSessionForRequest(req, res) {
	debug('no session for HTTP request to %s', req.headers.host);
	errorResponse(res, 'no-session');
};

function _errNoSessionForSocket() {
	debug('no session for socket, aborting');
	errorResponse(this, 'no-session');
}