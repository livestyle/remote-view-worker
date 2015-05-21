'use strict'

var assert = require('assert');
var extend = require('xtend');
var Tunnel = require('remote-view-client/lib/tunnel');
var localServer = require('./local-server');
var rvServer = require('../../lib/server');
var Session = require('../../lib/session');

var defaultOptions = {
	docroot: __dirname,
	sessionId: 'test',
	reverseTunnelPort: 9001,
	httpServerPort: 9002,
	localServerPort: 9010,
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
			reverseTunnelPort: options.reverseTunnelPort,
			httpServerPort: options.httpServerPort,
			sessionManager: self.sessionManager
		});
	},
	after() {
		var self = module.exports;
		self.local.stop();
		self.rv.stop();
	},
	connect(callback) {
		var self = module.exports;
		return new Tunnel(self.options.reverseTunnelPort, self.options.sessionId, callback);
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