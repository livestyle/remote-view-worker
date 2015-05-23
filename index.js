#!/usr/bin/env iojs
'use strict';

module.exports = require('./lib/server');

if (require.main === module) {
	var sessionManager = require('./lib/session-manager');
	sessionManager.setSessionOptions({
		requestTimeout: 10000
	});
	
	module.exports(function() {
		console.log('Remote View worker is up and running on %d', this.address().port);
	});
}
