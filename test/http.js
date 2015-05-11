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

describe('HTTP Tunnel', function() {
	var local, rv;
	var session = new Session({
		"socketId": "test",
		"remoteSiteId": "rv",
		"localSite": "http://localhost:9010",
		"maxConnections": 2
	});
	var connect = function() {
		var socket = tunnel(reverseTunnelPort);
		session.addSocket(socket);
		return socket;
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

	it('simple request', function(done) {
		var socket = connect();
		request('http://localhost:9010', function(err, res, body) {
			console.log('body:', body);
			socket.destroy();
			done();
		});
	});
});