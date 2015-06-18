/**
 * Tries to encode transmitted data with gzip
 */
'use strict';

var zlib = require('zlib');
var stream = require('stream');
var duplexer = require('duplexer2');
var debug = require('debug')('rv:worker:gzip');
var headerUtils = require('../header-utils');
var noop = require('../utils').noopStream;

// supported content types for compression
const mimeTypes = [
	'text/plain', 'text/css', 'text/html',
	'text/javascript', 'application/x-javascript', 'application/javascript',
	'application/xml', 'text/xml'
];

module.exports = function(request, response) {
	var output = noop();
	var input = new GzipStream(request, response, output);
	return duplexer(input, output);
};

class GzipStream extends stream.Transform {
	constructor(request, response, output) {
		super();
		this.request = request;
		this.response = response;
		this.output = this.pipe(output);
		this._processed = false;
	}

	_transform(chunk, enc, next) {
		if (!this._processed) {
			this._processed = true;
			updatePipeline(this.request, this.response, this, this.output);
		}

		next(null, chunk);
	}

	_flush(next) {
		this.request = this.response = this._output = null;
		next();
	}
}

function updatePipeline(request, response, input, output) {
	if (response.getHeader('Content-Encoding')) {
		return debug('content already encoded');
	}

	var enc = headerUtils.supportedEncoding(request.headers['accept-encoding']);
	if (!enc) {
		return debug('client does not support content encoding, skip');
	}

	debug('encode with %s', enc);
	response.removeHeader('Content-Length');
	response.setHeader('Content-Encoding', enc);

	input.unpipe(output);
	input
	.pipe(enc === 'gzip' ? zlib.createGzip() : zlib.createDeflate())
	.pipe(output);
}
