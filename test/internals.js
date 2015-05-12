'use strict'

var path = require('path');
var assert = require('assert');
var request = require('request');
var rvServer = require('../lib/server');
var Session = require('../lib/session');
var tunnel = require('./assets/tunnel');
var localServer = require('./assets/local-server');

var reverseTunnelPort = 9001;
var httpServerPort = 9002;
var localServerPort = 9010;
var nextTick = process.nextTick;

describe('Internals', function() {
	var local, rv;
	var session = new Session({
		"sessionId": "test",
		"remoteSiteId": "rv",
		"localSite": "http://localhost:9010",
		"maxConnections": 2
	}, {
		maxQueue: 2,
		socketWaitTimeout: 500
	});
	var sessionManager = {
		getSession(req) {
			return this.empty ? null : session;
		},
		empty: false
	};
	var connect = function(callback) {
		return tunnel(reverseTunnelPort, callback);
	};

	before(function() {
		// fake local web-server
		local = localServer({
			docroot: path.join(__dirname, 'assets'),
			port: localServerPort
		});

		// RV worker instance
		rv = rvServer({
			reverseTunnelPort: reverseTunnelPort,
			httpServerPort: httpServerPort,
			sessionManager: sessionManager
		});
	});

	after(function() {
		local.stop();
		rv.stop();
	});

	it('max connections', function(done) {
		var complete = function() {
			// redundant socket must be destroyed as soon as it was connected
			assert.equal(session.sockets.length, session.data.maxConnections);
			assert(this.destroyed);

			// clean-up
			s1.removeListener('close', complete).destroy();
			s2.removeListener('close', complete).destroy();
			s3.removeListener('close', complete).destroy();
			done();
		};
		var s1 = connect().once('close', complete);
		var s2 = connect().once('close', complete);
		var s3 = connect().once('close', complete);
	});

	it('pending requests', function(done) {
		// connect only one socket but make two requests:
		// the second request must be queued until 
		// next socket is available
		var code1, body1;
		connect();
		setTimeout(connect, 300);

		request('http://localhost:9002/', function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(body.indexOf('Sample index file') !== -1);

			request('http://localhost:9002/', function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 200);
				assert(body.indexOf('Sample index file') !== -1);

				nextTick(function() {
					assert.equal(session.sockets.length, 0);
					done();
				});
			});
		});
	});

	it('request queue', function(done) {
		// allow only `maxQueue` HTTP request, 
		// close extra requests with error
		var requests = 3;
		var responses = 0;
		var codes = {};
		var complete = function(err, res, body) {
			responses++;
			if (res.statusCode in codes) {
				codes[res.statusCode]++
			} else {
				codes[res.statusCode] = 1;
			}

			if (responses === requests) {
				// one request must be closed with 429 code (too many requests),
				// two must be closed by timeout with 408 code (no free socket)
				assert.equal(Object.keys(codes).length, 2);
				assert.equal(codes['429'], 1);
				assert.equal(codes['408'], 2);
				done();
			}
		};

		for (var i = 0; i < requests; i++) {
			request('http://localhost:9002/', complete);
		}
	});

	it('no session', function(done) {
		sessionManager.empty = true;
		request('http://localhost:9002', function(err, res, body) {
			sessionManager.empty = false;
			assert.equal(res.statusCode, 403);
			done();
		});
	});

	it('destroy session', function(done) {
		// when session is destroyed, all pending requests
		// must return with error, no more connections can be added
		request('http://localhost:9002', function(err, res, body) {
			assert.equal(res.statusCode, 500);
			assert.equal(body, 'User session is destroyed');
			request('http://localhost:9002', function(err, res, body) {
				assert.equal(res.statusCode, 500);
				assert.equal(body, 'User session is destroyed');
				done();
			});
		});

		setTimeout(function() {
			session.destroy();
		}, 200);
	});
});