'use strict'

var assert = require('assert');
var extend = require('xtend');
var Tunnel = require('remote-view-client').Tunnel;
var localServer = require('./local-server');
var rvServer = require('../../lib/server');
var Session = require('../../lib/session');

var defaultOptions = {
	docroot: __dirname,
	sessionId: 'test',
	reverseTunnelPort: 9001,
	localServerPort: 9999,
	maxConnections: 2,
	ssl: false
};

module.exports = {
	before() {
		var self = module.exports;
		var options = self.options = extend({}, defaultOptions, arguments[0] || {});

		var localPortKey = options.ssl ? 'sslPort' : 'port';
		var localOpt = {docroot:  options.docroot};
		localOpt[localPortKey] = options.localServerPort;

		self.session = new Session({
			"sessionId": "test",
			"remoteSiteId": "rv",
			"localSite": `${options.ssl ? 'https' : 'http'}://localhost:${options.localServerPort}`,
			"maxConnections": options.maxConnections
		}, options.sessionOpt);

		self.sessionManager = {
			getSession(req) {
				return this.empty ? null : self.session;
			},
			empty: false
		};
		
		// fake local web-server
		self.local = localServer(localOpt);

		// RV worker instance
		self.rv = rvServer({
			port: options.reverseTunnelPort,
			sessionManager: self.sessionManager
		});
	},
	after() {
		var self = module.exports;
		self.rv.close(function() {
			self.local.stop();
		});
	},
	connect(url, callback) {
		var self = module.exports;
		if (typeof url === 'function') {
			callback = url;
			url = null;
		}

		if (!url) {
			url = `http://localhost:${self.options.reverseTunnelPort}/session-test`;
		}

		return new Tunnel(url, self.options.sessionId, callback);
	},
	noSocketLeak(socket, callback) {
		var self = module.exports;
		// make sure socket connection is not leaked
		setTimeout(function() {
			assert.equal(self.session.sockets.length, 0);
			assert(socket.destroyed);
			callback();
		}, 20);
	}
};