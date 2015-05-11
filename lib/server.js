/**
 * Creates server instances for handling Remote View requests
 */
'use strict'

var net = require('net');
var http = require('http');
var extend = require('xtend');
var debug = require('debug')('rv-worker');
var errorResponse = require('./error-response');

var defaultOptions = {
	reverseTunnelPort: 9001,
	httpServerPort: 9002,
	sessionManager: require('./session-manager')
};

module.exports = function(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	options = extend({}, defaultOptions, options || {});

	var manager = options.sessionManager;
	var _servers = 2;
	var _complete = function() {
		if (--_servers === 0 && typeof callback === 'function') {
			callback(out);
		}
	};

	var out = {
		stop(callback) {
			var _servers = 2;
			var _complete = function() {
				if (--_servers === 0 && typeof callback === 'function') {
					callback();
				}
			};
			reverseTunnel.close(_complete);
			httpServer.close(_complete);
		}
	};

	// reverse tunnel server
	var reverseTunnel = out.reverseTunnel = net.createServer(function(socket) {
		var session = manager.getSession(socket);
		if (session) {
			session.addSocket(socket);
		} else {
			// error: no session for given client
			debug('no session for socket');
			session.destroy();
		}
	}).listen(options.reverseTunnelPort, function() {
		debug('Created reverse tunnel server at :%d', options.reverseTunnelPort);
		_complete();
	});

	// http server
	var httpServer = out.httpServer = http.createServer(function(req, res) {
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
	.listen(options.httpServerPort, function() {
		debug('Created HTTP server at :%d', options.httpServerPort);
		_complete();
	});

	return out;
};