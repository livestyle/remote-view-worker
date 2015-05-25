/**
 * Tries to encode transmitted data with gzip
 */
'use strict';

var zlib = require('zlib');
var through = require('through2');
var combine = require('stream-combiner2');
var debug = require('debug')('rv:worker:gzip');
var headerUtils = require('../header-utils');

// supported content types for compression
const mimeTypes = [
	'text/plain', 'text/css', 'text/html',
	'text/javascript', 'application/x-javascript', 'application/javascript',
	'application/xml', 'text/xml'
];

module.exports = function(request, response) {
	var processed = false;
	var output = through();
	var input = through(function(chunk, enc, next) {
		if (!processed) {
			processed = true;
			updatePipeline(request, response, input, output);
		}

		next(null, chunk);
	});

	return combine(input, output);
};

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
