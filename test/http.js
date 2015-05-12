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

describe.only('HTTP Tunnel', function() {
	var local, rv;
	var session = new Session({
		"socketId": "test",
		"remoteSiteId": "rv",
		"localSite": "http://localhost:9010",
		"maxConnections": 2
	});
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
			sessionManager: {
				getSession(req) {
					return session; 
				}
			}
		});
	});

	after(function() {
		local.stop();
		rv.stop();
	});

	it('get', function(done) {
		var socket = connect();
		request('http://localhost:9002', function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/html') !== -1);
			assert(body.indexOf('Sample index file') !== -1);

			setTimeout(function() {
				// make sure socket connection is not leaked
				assert.equal(session.sockets.length, 0);
				assert(socket.destroyed);
				done();
			}, 20);
		});
	});


});