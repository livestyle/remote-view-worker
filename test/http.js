'use strict'

var fs = require('fs');
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
		"sessionId": "test",
		"remoteSiteId": "rv",
		"localSite": "http://localhost:9010",
		"maxConnections": 2
	});
	var connect = function(callback) {
		return tunnel(reverseTunnelPort, callback);
	};
	var noSocketLeak = function(socket, callback) {
		// make sure socket connection is not leaked
		setTimeout(function() {
			assert.equal(session.sockets.length, 0);
			assert(socket.destroyed);
			callback();
		}, 20);
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
			noSocketLeak(socket, done);
		});
	});

	it('head', function(done) {
		var socket = connect();
		request({
			url: 'http://localhost:9002',
			method: 'HEAD'
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/html') !== -1);
			// body must be empty because this is HEAD request
			assert(!body);
			noSocketLeak(socket, done);
		});
	});

	it('post', function(done) {
		var socket = connect();
		request.post({
			url: 'http://localhost:9002/post',
			form: {
				foo: 'bar',
				one: 1,
				text: 'Hello world'
			}
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/plain') !== -1);
			assert.equal(body, 'Posted {"foo":"bar","one":"1","text":"Hello world"}');
			noSocketLeak(socket, done);
		});
	});

	it('post multipart', function(done) {
		var socket = connect();
		var filePath = path.join(path.join(__dirname, 'assets/image.png'));
		var stat = fs.statSync(filePath);
		request.post({
			url: 'http://localhost:9002/upload',
			formData: {
				file: {
					value: fs.createReadStream(filePath),
					options: {
						filename: path.basename(filePath),
						contentType: 'image/png'
					}
				}
			}
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/plain') !== -1);
			assert.equal(body, `Uploaded file: ${path.basename(filePath)} (${stat.size} bytes)`);
			noSocketLeak(socket, done);
		});
	});

	it('post multipart (10 MB)', function(done) {
		var socket = connect();
		var data = require('crypto').pseudoRandomBytes(1024 * 1024 * 10);
		request.post({
			url: 'http://localhost:9002/upload',
			formData: {
				file: {
					value: data,
					options: {
						filename: 'large.bin',
						contentType: 'application/octet-stream'
					}
				}
			}
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/plain') !== -1);
			assert.equal(body, `Uploaded file: large.bin (${data.length} bytes)`);
			noSocketLeak(socket, done);
		});
	});

	describe('Auth', function() {
		it('no credentials', function(done) {
			connect();
			request('http://localhost:9002/auth', function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 401);
				done();
			});
		});

		it('wrong credentials', function(done) {
			connect();
			request({
				url: 'http://localhost:9002/auth',
				auth: {
					'user': 'foo',
					'password': 'bar'
				}
			}, function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 401);
				done();
			});
		});

		it('right credentials', function(done) {
			connect();
			request({
				url: 'http://localhost:9002/auth',
				auth: {
					'user': 'admin',
					'password': 'password'
				}
			}, function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 200);
				assert.equal(body, 'Authorized as admin:password');
				done();
			});
		});
	});

});