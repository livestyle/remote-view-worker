'use strict';

var http = require('http');
var parseUrl = require('url').parse;
var debug = require('debug')('rv:server');
var extend = require('xtend');
var WebSocketServer = require('websocket').server;
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
			? addLiveStyleSocketToSession
			: addSocketToSession;
		sessionManager.getSession(sessionId, stats).then(
			fn.bind(socket), 
			_errNoSessionForSocket.bind(socket)
		);
	})
	.on('clientError', function(err) {
		stats.writeError(err.message);
	});

	// Setup WebSocket server to handle communication between
	// user and destination LiveStyle server. Since this server handles
	// all WebSocket connections, we will route LS/non-LS connections here
	var ws = new WebSocketServer({
		httpServer: server,
		useNativeKeepalive: true,
		autoAcceptConnections: false
	})
	.on('request', function(req) {
		debug('got WebSocket request');
		stats.upgrade++;
		storeSocket(req.socket);

		sessionManager.getSession(req.httpRequest).then(function(session) {
			if (isLiveStyleTunnelRequest(req.httpRequest)) {
				// it’s a LiveStyle connection, accept it and handle
				// with current server
				debug('connecting to LiveStyle tunnel');
				return session.addLiveStyleClient(req.accept());
			}

			// it’s a regular connection, route it as usual but trick
			// WS server by telling that this request was accepted
			ws.handleRequestResolved(req);
			req.socket.websocket = true;
			session.redirect(req.httpRequest, req.socket);
		}, function() {
			req.reject(403);
		});
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
		ws.shutDown();
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

function addLiveStyleSocketToSession(session) {
	debug('livestyle tunnel ready');
	if (session.liveStyleTunnel) {
		// there’s already active LS connection
		errorResponse(this, 'ls-already-connected');
		return this.destroy();
	}
	this.write(
		'HTTP/1.1 200 Connection Established\r\n' +
		`X-RV-Host: ${LIVESTYLE_URL}\r\n` +
		'\r\n');
	session.liveStyleTunnel = this;
}

function isLiveStyleTunnelRequest(req) {
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