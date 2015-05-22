'use strict';

var net = require('net');
var http = require('http');
var https = require('https');
var parseUrl = require('url').parse;
var EventEmitter = require('events');
var debug = require('debug')('rv:tunnel');
var extend = require('xtend');

module.exports = class Tunnel extends EventEmitter {
	constructor(serverUrl, callback) {
		super();
		this._connected = false;
		this._destroyed = false;

		if (typeof callback === 'function') {
			this.once('connected', callback);
		}

		var self = this;
		var conn = extend(parseUrl(serverUrl), {
			method: 'CONNECT',
			rejectUnauthorized: false
		});
		this.sessionId = conn.pathname.replace(/^\/+/, '');

		var transport = /^https:/i.test(conn.protocol) ? https : http;
		transport.request(conn)
		.on('connect', function(res, rvSocket, head) {
			// successfully connected to RV server 
			debug('rv tunnel connected for session %s', self.sessionId);

			var url = parseUrl(res.headers['x-rv-host']);
			self.rvSocket = rvSocket.on('close', function() {
				self.destroy();
			});

			// connect to requested host
			self.socket = net.connect(url.port || 80, url.hostname, function() {
				// everything is OK, we’re ready for tunneling
				debug('remote tunnel connected to %s:%d', url.hostname, url.port || 80);
				self._connected = true;

				// tell RV server we are ready to accept connections:
				// simply send some data
				rvSocket.write('rv-ready');

				rvSocket.pipe(self.socket).pipe(rvSocket);

				process.nextTick(function() {
					self.emit('connected', self.socket);
				});
			})
			.once('close', function() {
				debug('socket closed for session %s', self.sessionId);
				self.destroy();
			})
			.once('error', function(err) {
				self.destroy();
				self.emit('error', err);
			});
		})
		.once('error', function(err) {
			self.emit('error', err);
		})
		.end();
	}

	get connected() {
		return this._connected;
	}

	get destroyed() {
		return this._destroyed;
	}

	destroy(err) {
		if (!this._destroyed) {
			debug('destroying tunnel for session %s', this.sessionId);
			this._destroyed = true;

			destroyIfNeeded(this.socket);
			destroyIfNeeded(this.rvSocket);
			this.socket = this.rvSocket = null;

			this.emit('destroy', err);
		}
		return this;
	}
};

function destroyIfNeeded(socket, err) {
	if (socket && !socket.destroyed) {
		socket.destroy(err);
	}
	return socket;
}