/**
 * A transform stream to inject custom code 
 * into incoming socket response
 */
'use strict'

var through = require('through2');
var debug = require('debug')('rv-worker');

module.exports = function(name) {
	debug('creating inject stream ' + name);
	return through(function(chunk, enc, next) {
		debug('piping %s: %s', name, chunk.toString());
		this.push(chunk);
		this.push(new Buffer('\nchunk'));
		next();
	}, function(next) {
		debug('done piping ' + name);
		// this.push(new Buffer('\nfinish'));
		next();
	});
};