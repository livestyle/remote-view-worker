'use strict';

var http = require('http');
var parseUrl = require('url').parse;
var debug = require('debug')('rv:server');
var extend = require('xtend');
var sessionManager = require('./session-manager');
var errorResponse = require('./error-response');

const LIVESTYLE_URL = 'http://localhost:54000';

var openedSockets = [];
var defaultOptions = {
	port: 9001
};

var stats = {
	get: 0,
	connect: 0,
	upgrade: 0,
	timeout: 0,
	sessionRequest: 0,
	sessionById: 0,
	sessionByPubcicId: 0,
	sessionFromCache: 0,
	sessionFromDB: 0,
	sessionError: 0
};

Object.defineProperties(stats, {
	error: {
		value: [],
	},
	writeError: {
		value: function(message) {
			this.error.unshift(message);
			while (this.error.length > 100) {
				this.error.pop();
			}
		}
	}
});

module.exports = function(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	options = extend({}, defaultOptions, options || {});

	var server = http.createServer(function(req, res) {
		stats.get++;
		debug('got request %s %s', req.method, req.url);

		sessionManager.getSession(req, stats).then(
			_sessionRedirect.bind(null, req, res), 
			_errNoSessionForRequest.bind(null, req, res)
		);
	})
	.on('connect', function(req, socket, head) {
		stats.connect++;
		var sessionId = req.url.replace(/^\/*|\/*$/g, '');
		debug('requested tunnel connection for session %s', sessionId);
		storeSocket(socket);

		var fn = req.headers['x-rv-connection'] === 'livestyle'
			? addLivestyleSocketToSession
			: addSocketToSession;
		sessionManager.getSession(sessionId, stats).then(
			fn.bind(socket), 
			_errNoSessionForSocket.bind(socket)
		);
	})
	.on('upgrade', function(req, socket, head) {
		debug('got WebSocket request');
		stats.upgrade++;
		storeSocket(socket);
		sessionManager.getSession(req).then(function(session) {
			socket.websocket = true;

			if (isLivestyleTunnelRequest(req)) {
				// requested connection to LiveStyle tunnel
				return session.livestyleRedirect(req, socket, LIVESTYLE_URL);
			}

			session.redirect(req, socket, head);
		}, function() {
			socket.destroy();
		});
	})
	.on('clientError', function(err) {
		stats.writeError(err.message);
	});
	server.listen(options.port, 2048, function() {
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
	debug('tunnel ready');
	this.write(
		'HTTP/1.1 200 Connection Established\r\n' +
		`X-RV-Host: ${session.data.localSite}\r\n` +
		'\r\n');
	session.addSocket(this);
}

function addLivestyleSocketToSession(session) {
	debug('livestyle tunnel ready');
	if (session.livestyleTunnel) {
		// there’s already active LS connection
		errorResponse(this, 'ls-already-connected');
		return this.destroy();
	}
	this.write(
		'HTTP/1.1 200 Connection Established\r\n' +
		`X-RV-Host: ${LIVESTYLE_URL}\r\n` +
		'\r\n');
	session.livestyleTunnel = this;
}

function isLivestyleTunnelRequest(req) {
	return /^\/__livestyle__\b/.test(req.url);
}

function _sessionRedirect(req, res, session) {
	session.redirect(req, res);
};

function _errNoSessionForRequest(req, res) {
	debug('no session for HTTP request to %s', req.headers.host);
	stats.writeError('no session for request');
	errorResponse(res, 'no-session');
};

function _errNoSessionForSocket() {
	debug('no session for socket, aborting');
	stats.writeError('no session for socket');
	errorResponse(this, 'no-session');
}