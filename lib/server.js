'use strict';

var http = require('http');
var debug = require('debug')('rv:server');
var extend = require('xtend');
var errorResponse = require('./error-response');

var defaultOptions = {
	port: 9001,
	sessionManager: require('./session-manager')
};

module.exports = function(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	options = extend({}, defaultOptions, options || {});

	var manager = options.sessionManager;
	var server = http.createServer(function(req, res) {
		debug('got request %s %s', req.method, req.url);
		manager.getSession(req).then(function(session) {
			session.redirect(req, res);
		}, function(err) {
			errorResponse(res, 'no-session');
		});
	})
	.on('connect', function(req, socket, head) {
		var sessionId = req.url.replace(/^\/*|\/*$/g, '');
		debug('requested tunnel connection for session %s', sessionId);
		manager.getSession(sessionId).then(function(session) {
			socket.write(
				'HTTP/1.1 200 Connection Established\r\n' +
				`X-RV-Host: ${session.data.localSite}\r\n` +
				'\r\n'
			);

			// wait until tunnel sends first chunk: it means it is
			// connected to requested server and ready for tunneling
			socket.once('data', function() {
				debug('tunnel ready');
				session.addSocket(socket);
			});
		}, function() {
			errorResponse(socket, 'no-session');
		});
	})
	.on('upgrade', function(req, socket, head) {
		debug('got WebSocket request');
		manager.getSession(req).then(function(session) {
			session.redirect(req, socket, head);
		}, function() {
			// TODO have to check if this really closes connection
			req.emit('close');
		});
	});
	server.listen(options.port, function() {
		debug('running RV worker on %d', options.port);
		if (typeof callback === 'function') {
			callback.call(server);
		}
	});
	server.options = options;
	return server;
};