/**
 * A tiny wrapper for HTTP response transformer stream:
 * adds additional properties to created stream
 */
'use strict';

var through = require('through2');

module.exports = function(transform, flush) {
	return through(transform, flush)
	.once('pipe', function(reader) {
		this.request = reader.request;
		this.response = reader.response;
		Object.defineProperty(this, 'contentLength', {
			get() {
				var len = +this.response.getHeader('Content-Length');
				if (isNaN(len)) {
					len = -1;
				}
				return len;
			},
			set(value) {
				value = +value;
				if (!isNaN(value)) {
					this.response.setHeader('Content-Length', value)
				}
			}
		});
	});
}