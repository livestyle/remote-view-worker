/**
 * Utility wrapper for creating HTTP response transformation
 * pipeline
 */
'use strict'

var through = require('through2');
var combine = require('stream-combiner2');

module.exports = function(factory, condition) {
	var processed = false;
	var output = through();
	var input = through(function(chunk, enc, next) {
		if (!processed) {
			processed = true;
			let pipeline = factory();
			if (typeof pipeline === 'object' && typeof pipeline.pipe === 'function') {
				input.unpipe(output);
				pipeline.pipe(output);
				output = pipeline;
			}
		}

		output.write(chunk, enc, next);
	}, function(next) {
		output.end();
		next();
	});

	return combine(input, output);
};