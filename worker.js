#!/usr/bin/env iojs
'use strict';

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
		var ix = process.argv.indexOf('--test');
		if (ix) {
			// create a test session for given url
			var sessionId = '__test-session';
			var localSite = process.argv[ix + 1] || 'http://localhost:8080';
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

			process.on('SIGINT', function() {
				db.collection('Session').deleteOne({_id: sessionId}, function() {
					console.log('removed temp session');
					db.close();
					process.exit();
				});
			});
		}
	});
});