'use strict'

var path = require('path');
var assert = require('assert');
var sessionManager = require('../lib/session-manager');
var env = require('./assets/test-setup');

describe('Internals', function() {
	var sessionId = env.sessionId.toString();
	before(function(done) {
		env.before({
			sessionOpt: {
				maxTunnels: 2,
				maxQueue: 2,
				socketWaitTimeout: 500,
				requestTimeout: 500
			}
		}, done);
	});
	after(env.after);

	it('max connections', function(done) {
		var complete = function() {
			// redundant socket must be destroyed as soon as it was connected
			sessionManager.getSession(sessionId).then(function(session) {
				assert.equal(session.sockets.length, session.options.maxTunnels);

				// clean-up
				s1.removeListener('destroy', complete).destroy();
				s2.removeListener('destroy', complete).destroy();
				s3.removeListener('destroy', complete).destroy();
				
				done();
			}).then(null, done);
		};
		var s1 = env.connect().once('destroy', complete);
		var s2 = env.connect().once('destroy', complete);
		var s3 = env.connect().once('destroy', complete);
	});

	it('pending requests', function(done) {
		// connect only one socket but make two requests:
		// the second request must be queued until 
		// next socket is available
		env.request('http://localhost:9001/', function(err, res, body, socket) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(body.indexOf('Sample index file') !== -1);

			setTimeout(env.connect, 300);

			env.rawRequest('http://localhost:9001/index.html', function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 200);
				assert(body.indexOf('Sample index file') !== -1);

				sessionManager.getSession(sessionId).then(function(session) {
					assert.equal(session.sockets.length, 0);
					done();
				}).then(null, done);
			});
		});
	});

	it('request queue', function(done) {
		// allow only `maxQueue` amount of HTTP requests, 
		// close extra requests with error
		var requests = 3;
		var responses = 0;
		var codes = {};
		var complete = function(err, res, body) {
			responses++;
			if (res.statusCode in codes) {
				codes[res.statusCode]++;
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

		// make initial tunnel connection to indicate that session is active
		var tunnel = env.connect(function() {
			tunnel.destroy();
		}).once('destroy', function() {
			for (var i = 0; i < requests; i++) {
				env.rawRequest('http://localhost:9001/', complete);
			}
		});
	});

	it('no session', function(done) {
		env.rawRequest('http://localhost:9001', {headers: {'X-RV-Host': 'not-exists.livestyle.io'}}, function(err, res, body) {
			assert.equal(res.statusCode, 412);
			done();
		});
	});

	it('destroy session', function(done) {
		// when session is destroyed, all pending requests
		// must return with error, no more connections can be added
		// make initial tunnel connection to indicate that session is active
		var tunnel = env.connect(function() {
			tunnel.destroy();
		}).once('destroy', function() {
			env.rawRequest('http://localhost:9001', function(err, res, body) {
				assert.equal(res.statusCode, 412);
				assert.equal(body, 'No Remote View session for given request');
				env.rawRequest('http://localhost:9001', function(err, res, body) {
					assert.equal(res.statusCode, 412);
					assert.equal(body, 'No Remote View session for given request');
					done();
				});
			});
		});

		sessionManager.getSession(sessionId).then(function(session) {
			session.destroy();
		}).then(null, done);
	});
});