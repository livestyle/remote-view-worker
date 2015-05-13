'use strict'

var path = require('path');
var assert = require('assert');
var request = require('request');
var env = require('./assets/test-setup');

var nextTick = process.nextTick;

describe('Internals', function() {
	before(env.before.bind(env, {
		sessionOpt: {
			maxQueue: 2,
			socketWaitTimeout: 500
		}
	}));
	after(env.after);

	it('max connections', function(done) {
		var complete = function() {
			// redundant socket must be destroyed as soon as it was connected
			assert.equal(env.session.sockets.length, env.session.data.maxConnections);
			assert(this.destroyed);

			// clean-up
			s1.removeListener('close', complete).destroy();
			s2.removeListener('close', complete).destroy();
			s3.removeListener('close', complete).destroy();
			done();
		};
		var s1 = env.connect().once('close', complete);
		var s2 = env.connect().once('close', complete);
		var s3 = env.connect().once('close', complete);
	});

	it('pending requests', function(done) {
		// connect only one socket but make two requests:
		// the second request must be queued until 
		// next socket is available
		var code1, body1;
		env.connect();
		setTimeout(env.connect, 300);

		request('http://localhost:9002/', function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(body.indexOf('Sample index file') !== -1);

			request('http://localhost:9002/', function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 200);
				assert(body.indexOf('Sample index file') !== -1);

				nextTick(function() {
					assert.equal(env.session.sockets.length, 0);
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
		env.sessionManager.empty = true;
		request('http://localhost:9002', function(err, res, body) {
			env.sessionManager.empty = false;
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
			env.session.destroy();
		}, 200);
	});
});