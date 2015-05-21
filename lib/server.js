/**
 * Creates server instances for handling Remote View requests
 */
'use strict'

var net = require('net');
var http = require('http');
var extend = require('xtend');
var debug = require('debug')('rv:worker');
var errorResponse = require('./error-response');

const TUNNEL_READY = new Buffer('rv-ready');

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
	// var reverseTunnel = out.reverseTunnel = net.createServer(function(socket) {
	// 	// errorResponse(socket, 'no-session');
	// 	// return socket.destroy();

	// 	var session = manager.getSession(socket);
	// 	if (session) {
	// 		session.addSocket(socket);
	// 	} else {
	// 		// error: no session for given client
	// 		debug('no session for socket');
	// 		errorResponse(socket, 'no-session');
	// 		socket.destroy();
	// 		session.destroy();
	// 	}
	// }).listen(options.reverseTunnelPort, function() {
	// 	debug('Created reverse tunnel server at :%d', options.reverseTunnelPort);
	// 	_complete();
	// });
	
	var reverseTunnel = out.reverseTunnel = http.createServer(function(res, req) {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('LiveStyle Remote View server is up and running');
	})
	.on('connect', function(req, socket, head) {
		var sessionId = req.headers['x-rv-session'];
		debug('connecting to %s session', sessionId);
		var session = manager.getSession(sessionId);
		if (session) {
			debug('session found, store socket connection');
			socket.write('HTTP/1.1 200 Accepted\r\n' +
				`X-RV-Host: ${session.data.localSite}\r\n` +
				`X-RV-Session: ${sessionId}\r\n` +
				'\r\n', function() {
					session.addSocket(socket);
				});
			// Wait until 'rv-ready' message arrive, 
			// after that we are ready to send data over tunnel.
			// NB: this is used to emulate TCP stream flush.
			// We have to either wait for incoming message (which guarantees
			// that tunnel successfully established) or use large setTimeout
			// and *hope* initial response header was flushed *before* we send
			// queued HTTP request
			// socket.once('data', function(chunk) {
			// 	session.addSocket(socket);
			// });
		} else {
			// error: no session for given client
			debug('no session for socket');
			errorResponse(socket, 'no-session');
			socket.destroy();
		}
	})
	.listen(options.reverseTunnelPort, function() {
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