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

describe('Response transformations', function() {
	var local, rv;
	var session = new Session({
		"sessionId": "test",
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

	it('inject into plain HTML', function(done) {
		var socket = connect();
		request('http://localhost:9002', function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert.equal(res.headers['content-encoding'], undefined); 
			assert(body.indexOf('<!-- RV injected -->') !== -1);
			done();
		});
	});

	it('inject into compressed HTML', function(done) {
		var socket = connect();
		request({
			url: 'http://localhost:9002/compressed',
			gzip: true
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert.equal(res.headers['content-encoding'], 'gzip'); 
			assert(body.indexOf('<!-- RV injected -->') !== -1);
			done();
		});
	});

	it('compress', function(done) {
		var socket = connect();
		request({
			url: 'http://localhost:9002',
			gzip: true
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert.equal(res.headers['content-encoding'], 'gzip'); 
			done();
		});
	});

});