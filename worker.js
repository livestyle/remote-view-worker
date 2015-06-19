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
	});
});