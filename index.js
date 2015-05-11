#!/usr/bin/env iojs
'use strict'
require('./lib/server')(function() {
	var debug = require('debug')('rv-worker');
	debug('Remote View worker is up and running');
});