#!/usr/bin/env iojs
'use strict';

var path = require('path');
var http = require('http');
var mongo = require('mongodb').MongoClient;
var server = require('./lib/server');
var sessionManager = require('./lib/session-manager');

var mongoUrl = process.env.RV_MONGO_DB || 'mongodb://localhost:27017/rv';
var curServer;

mongo.connect(mongoUrl, function(err, db) {
	if (err) {
		throw err;
	}

	sessionManager.setup(db);
	curServer = server(function() {
		console.log('Remote View worker is up and running on %d', this.address().port);
		// create a test session for given url
		var sessionId = '__test-session';
		var localSite = 'http://localhost:9010';
		db.collection('Session').update({_id: sessionId}, {$set: {
			_id: sessionId,
			user: 0,
			publicId: 'rv-test',
			localSite: localSite,
			created: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000,
			active: true
		}}, {upsert: true}, function(err) {
			if (err) {
				throw err;
			}

			console.log('Created temp session with id %s for local site %s', sessionId, localSite);

			setInterval(stats, 300).unref();
		});

		http.createServer(function(req, res) {
			res.end('OK');
		}).listen(9010);
		console.log('Created test server at 9010');
	});
});

var charm = require('charm')(process);
charm.reset();

function stats() {
	// draw simple dashboard
	var sessionIds = sessionManager.activeSessions();
	var dy = 1;
	var line = function(msg) {
		charm.position(1, dy++).write(msg);
	};
	charm.erase('screen').cursor(false);
	sessionIds.forEach(function(id) {
		sessionManager.getSession(id).then(function(session) {
			line(`${id}: opened: ${session.sockets.length}, pending: ${session._queue.length}, served: ${session._socketId}`);
		});
	});
	line(`Opened server sockets: ${server.openedSockets()}`);
	line(`Server stats:`);
	Object.keys(server.stats).forEach(function(key) {
		line(`   ${key}: ${server.stats[key]}`);
	});

	curServer.getConnections(function(err, count) {
		line('Actual connections: ' + count);
	});
}