#!/usr/bin/env iojs
'use strict';

var path = require('path');
var http = require('http');
var mongo = require('mongodb').MongoClient;
var server = require('./lib/server');
var sessionManager = require('./lib/session-manager');

var mongoUrl = process.env.RV_MONGO_DB || 'mongodb://localhost:27017/rv';

mongo.connect(mongoUrl, function(err, db) {
	if (err) {
		throw err;
	}

	sessionManager.setup(db);
	server(function() {
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
		});

		http.createServer(function(req, res) {
			res.end('OK');
		}).listen(9010);
		console.log('Created test server at 9010');
	});
});