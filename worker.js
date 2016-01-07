#!/usr/bin/env node
'use strict';

var mongo = require('mongodb').MongoClient;
var server = require('./lib/server');
var sessionManager = require('./lib/session-manager');
var utils = require('./lib/utils');

var mongoUrl = process.env.RV_MONGO_DB || 'mongodb://localhost:27017/rv';

mongo.connect(mongoUrl, function(err, db) {
	if (err) {
		console.error(utils.dateMark(), err);
		return process.exit(2);
	}

	sessionManager.setup(db, {
		trafficStoreTimeout: 10000
	});
	server(function() {
		console.log(utils.dateMark(), 'Remote View worker is up and running on', this.address().port);
	});
});