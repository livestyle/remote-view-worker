'use strict';

var net = require('net');
var http = require('http');
var parseUrl = require('url').parse;
var debug = require('debug')('rv:test');
var Tunnel = require('remote-view-client/lib/tunnel');
var rv = require('./lib2/server');
var Session = require('./lib2/session');

var _session = new Session({
	"userId": "123",
	"sessionId": "sess-test",
	"remoteSiteId": "super-duper",
	"localSite": "http://emmet.io",
	"expiresAt": 1430258415646,
	"maxConnections": 6,
	"worker": "10.0.1.2"
});

var options = {
	port: 1337, 
	sessionManager: {
		getSession() {
			return _session;
		}
	}
}

rv(options, function(server) {
	var tunnel = new Tunnel(`http://localhost:${options.port}/sess-test`, function() {
		debug('created tunnel');
	});

	var url = parseUrl(`http://localhost:${options.port}/hello.txt`);
	url.header = {connection: 'close'};

	http.request(url, function(res) {
		debug('got response %o', res.headers);
		res.on('data', function(chunk) {
			debug(chunk.toString());
		});
		res.on('end', function() {
			debug('response end');
			server.close();
		});
	}).end();
});