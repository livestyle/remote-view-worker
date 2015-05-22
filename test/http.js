'use strict'

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var request = require('request');
var env = require('./assets/test-setup');

describe('HTTP Tunnel', function() {
	before(env.before);
	after(env.after);

	it('get', function(done) {
		var socket = env.connect();
		request('http://localhost:9001', function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/html') !== -1);
			assert(body.indexOf('Sample index file') !== -1);
			env.noSocketLeak(socket, done);
		});
	});

	it('head', function(done) {
		var socket = env.connect();
		request({
			url: 'http://localhost:9001',
			method: 'HEAD'
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert(res.headers['content-type'].indexOf('text/html') !== -1);
			// body must be empty because this is HEAD request
			assert(!body);
			env.noSocketLeak(socket, done);
		});
	});

	it('post', function(done) {
		var socket = env.connect();
		request.post({
			url: 'http://localhost:9001/post',
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
			env.noSocketLeak(socket, done);
		});
	});

	it('post multipart', function(done) {
		var socket = env.connect();
		var filePath = path.join(__dirname, 'assets/image.png');
		var stat = fs.statSync(filePath);
		request.post({
			url: 'http://localhost:9001/upload',
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
			env.noSocketLeak(socket, done);
		});
	});

	it('post multipart (10 MB)', function(done) {
		var socket = env.connect();
		var data = require('crypto').pseudoRandomBytes(1024 * 1024 * 10);
		request.post({
			url: 'http://localhost:9001/upload',
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
			env.noSocketLeak(socket, done);
		});
	});

	describe('Auth', function() {
		it('no credentials', function(done) {
			env.connect();
			request('http://localhost:9001/auth', function(err, res, body) {
				assert(!err);
				assert.equal(res.statusCode, 401);
				done();
			});
		});

		it('wrong credentials', function(done) {
			env.connect();
			request({
				url: 'http://localhost:9001/auth',
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
			env.connect();
			request({
				url: 'http://localhost:9001/auth',
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