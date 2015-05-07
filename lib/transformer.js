/**
 * A tiny wrapper for HTTP response transformer stream:
 * adds additional properties to created stream
 */
'use strict';

var through = require('through2');

module.exports = function(transform, flush) {
	return through(transform, flush).once('pipe', function(reader) {
		wrap(this, reader);
	});
};

module.exports.wrap = function wrap(stream, parent) {
	stream.request = parent.request;
	stream.response = parent.response;
	Object.defineProperty(stream, 'contentLength', {
		get() {
			var len = +stream.response.getHeader('Content-Length');
			return isNaN(len) ? -1 : len;
		},
		set(value) {
			value = +value;
			if (!isNaN(value)) {
				stream.response.setHeader('Content-Length', value);
			}
		}
	});
};
