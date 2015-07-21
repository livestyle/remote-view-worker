'use strict'

var path = require('path');
var assert = require('assert');
var sessionManager = require('../lib/session-manager');
var env = require('./assets/test-setup');

describe('Auto-destroy session', function() {
	var sessionId = env.sessionId.toString();
	before(function(done) {
		env.before({
			sessionOpt: {
				idleTimeout: 200
			}
		}, done);
	});
	after(env.after);

	it('keep alive on tunnel connect', function(done) {
		sessionManager.getSession(sessionId).then(function(session) {
			// get session instance and make sure it’s not destroyed after
			// `idleTimeout` delay
			setTimeout(function() {
				var tunnel = env.connect(function() {
					setTimeout(function() {
						assert(!session.destroyed);
						tunnel.destroy();
						done();
					}, 150);
				});
			}, 100);
		});
	});

	it('destroy on last tunnel disconnect', function(done) {
		sessionManager.getSession(sessionId).then(function(session) {
			// get session instance and make sure it’s destroyed after last 
			// tunnel disconnected
			var tunnel = env.connect(function() {
				tunnel.destroy();
				setTimeout(function() {
					assert(session.destroyed);
					done();
				}, 220);
			});
		});
	});

});