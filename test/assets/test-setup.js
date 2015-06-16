'use strict'

var assert = require('assert');
var extend = require('xtend');
var mongo = require('mongodb').MongoClient;
var Tunnel = require('remote-view-client').Tunnel;
var localServer = require('./local-server');
var rvServer = require('../../lib/server');
var Session = require('../../lib/session');
var sessionManager = require('../../lib/session-manager');

var _curDb = null;

var defaultOptions = {
	docroot: __dirname,
	sessionId: 'test',
	reverseTunnelPort: 9001,
	localServerPort: 9999,
	maxConnections: 2,
	ssl: false
};

module.exports = {
	before(opt, done) {
		var self = module.exports;
		if (typeof opt === 'function') {
			done = opt;
			opt = {};
		}

		var options = self.options = extend({}, defaultOptions, opt);

		var localPortKey = options.ssl ? 'sslPort' : 'port';
		var localOpt = {docroot:  options.docroot};
		localOpt[localPortKey] = options.localServerPort;

		// self.session = new Session({
		// 	"sessionId": "test",
		// 	"remoteSiteId": "rv",
		// 	"localSite": `${options.ssl ? 'https' : 'http'}://localhost:${options.localServerPort}`,
		// 	"maxConnections": options.maxConnections
		// }, options.sessionOpt);

		// fake local web-server
		self.local = localServer(localOpt);

		// RV worker instance
		self.rv = rvServer({
			port: options.reverseTunnelPort,
			sessionManager: self.sessionManager
		});

		// connect to test database
		mongo.connect('mongodb://localhost:27017/rv-test', function(err, db) {
			if (err) {
				throw err;
			}
			_curDb = db;
			sessionManager.setup(db, options.sessionOpt);

			// create some fake data
			db.collection('Session').insert({
				_id: 'session-test',
				user: 0,
				publicId: 'rv',
				localSite: `${options.ssl ? 'https' : 'http'}://localhost:${options.localServerPort}`,
				created: Date.now(),
				expiresAt: Date.now() + 24 * 60 * 60 * 1000,
				active: true
			}, done);
		});
	},
	after(done) {
		var self = module.exports;
		sessionManager.reset();
		self.rv.destroy(function() {
			console.log('rv destroyed');
			self.local.stop();
			_curDb.collection('Session').deleteOne({_id: 'session-test'}, function() {
				console.log('collection destroyed');
				_curDb.close()
				_curDb = null;
				done();
			});
		});
	},
	get db() {
		return _curDb;
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

		return new Tunnel(url, callback);
	},
	noSocketLeak(socket, callback) {
		var self = module.exports;
		// make sure socket connection is not leaked
		setTimeout(function() {
			sessionManager.getSession('session-test').then(function(session) {
				assert.equal(session.sockets.length, 0);
				assert(socket.destroyed);
				callback();
			});
		}, 20);
	}
};