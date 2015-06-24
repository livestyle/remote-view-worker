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

var stats = {
	get: 0,
	connect: 0,
	upgrade: 0,
	timeout: 0,
	error: 0
};

module.exports = function(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	options = extend({}, defaultOptions, options || {});

	var server = http.createServer(function(req, res) {
		stats.get++;
		debug('got request %s %s', req.method, req.url);
		// errorResponse(res, 'no-session');
		sessionManager.getSession(req).then(
			_sessionRedirect.bind(null, req, res), 
			_errNoSessionForRequest.bind(null, req, res)
		);
	})
	.on('connect', function(req, socket, head) {
		stats.connect++;
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
		stats.upgrade++;
		storeSocket(socket);
		sessionManager.getSession(req).then(function(session) {
			socket.websocket = true;
			session.addSocket(socket);
			session.redirect(req, socket, head);
		}, function() {
			socket.destroy();
		});
	})
	.on('clientError', function(err) {
		stats.error++;
		console.error(err);
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

module.exports.openedSockets = function() {
	return openedSockets.length;
};

module.exports.stats = stats;

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
	this.setTimeout(1000);
	this.once('timeout', onSocketTimeout);
	// .once('data', function() {
	// 	// wait until tunnel sends first chunk: it means it is
	// 	// connected to requested server and ready for tunneling
	// 	debug('tunnel ready');
	// 	this.setTimeout(0);
	// 	this.removeListener('timeout', onSocketTimeout);
	// 	session.addSocket(this);
	// })
	debug('tunnel ready');
	this.write(
		'HTTP/1.1 200 Connection Established\r\n' +
		`X-RV-Host: ${session.data.localSite}\r\n` +
		'\r\n');

	// a reason to add setTimeout() here is to ensure that
	// any request data is send AFTER rv-client receives 
	// acknowledge HTTP header. Otherwise, HTTP-connection
	// will be closed with error (because requests will be 
	// merged into a single payload which built-in HTTP parser
	// cannot handle)
	var self = this;
	setTimeout(function() {
		session.addSocket(self);
	}, 1);
}

function onSocketTimeout() {
	stats.timeout++;
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