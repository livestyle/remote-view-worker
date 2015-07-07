#!/usr/bin/env iojs
'use strict';

var http = require('http');
var mongo = require('mongodb').MongoClient;
var server = require('./lib/server');
var sessionManager = require('./lib/session-manager');

var mongoUrl = 'mongodb://localhost:27017/rv';

mongo.connect(mongoUrl, function(err, db) {
	if (err) {
		throw err;
	}

	sessionManager.setup(db, {trafficStoreTimeout: 5000});

	server(function() {
		console.log('Remote View worker is up and running on %d', this.address().port);
		// create a test session for given url
		var sessionId = '__test-session';
		var localSite = 'http://emmet.io';
		var publicId = 'rv-test.livestyle.local:9001';
		db.collection('Session').update({_id: sessionId}, {$set: {
			_id: sessionId,
			user: 0,
			publicId: publicId,
			localSite: localSite,
			created: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000,
			active: true
		}}, {upsert: true}, function(err) {
			if (err) {
				throw err;
			}

			console.log('Created temp session for local http://%s → %s', publicId, localSite);
		});
	});
});