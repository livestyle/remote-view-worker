'use strict'

var path = require('path');
var assert = require('assert');
var sessionManager = require('../lib/session-manager');
var env = require('./assets/test-setup');

describe('Traffic', function() {
	before(function(done) {
		env.before({
			sessionOpt: {
				trafficLimit: 10
			}
		}, done);
	});
	after(env.after);

	it('destroy session on traffic limit', function(done) {
		sessionManager.getSession('session-test').then(function(session) {
			// due to very low traffic limit this request should immediately
			// return error
			env.request('http://localhost:9001', function() {
				env.rawRequest('http://localhost:9001', function(err, res, body) {
					assert(session.destroyed);
					assert.equal(res.statusCode, 412);
					assert.equal(body, 'No Remote View session for given request');
					done();
				});
			});
		});
	});
});