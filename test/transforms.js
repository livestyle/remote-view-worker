'use strict'

var path = require('path');
var assert = require('assert');
var request = require('request');
var env = require('./assets/test-setup');

describe('Response transformations', function() {
	before(env.before);
	after(env.after);

	it('inject into plain HTML', function(done) {
		var socket = env.connect();
		request('http://localhost:9001', function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert.equal(res.headers['content-encoding'], undefined); 
			assert(body.indexOf('<!-- RV injected -->') !== -1);
			done();
		});
	});

	it('inject into compressed HTML', function(done) {
		var socket = env.connect();
		request({
			url: 'http://localhost:9001/compressed',
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
		var socket = env.connect();
		request({
			url: 'http://localhost:9001',
			gzip: true
		}, function(err, res, body) {
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert.equal(res.headers['content-encoding'], 'gzip'); 
			done();
		});
	});

});