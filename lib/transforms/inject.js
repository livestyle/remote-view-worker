/**
 * A transform stream to inject custom HTML code into 
 * incoming socket response. This transformer
 * automatically decodes gzip stream, if required,
 * and injects given code right before
 * </head>, </body> or </html>
 */
'use strict';

var zlib = require('zlib');
var through = require('through2');
var combine = require('stream-combiner2');
var debug = require('debug')('rv:worker:inject');
var htmlMatcher = require('../html-token-matcher');
var headerUtils = require('../header-utils');

// supported content types for injection
const mimeTypes = ['text/html'];

module.exports = function(session, request, response) {
	var processed = false;
	var output = through();
	var input = through(function(chunk, enc, next) {
		if (!processed) {
			processed = true;
			updatePipeline(session, response, input, output);
		}

		next(null, chunk);
	});

	return combine(input, output);
};

function updatePipeline(session, response, input, output) {
	// check if we have to transform this stream
	if (!headerUtils.matchesMime(response, mimeTypes)) {
		debug('unsupported mime-type, skip');
		return;
	}

	var encoded = response.getHeader('Content-Encoding');
	var enc = headerUtils.supportedEncoding(encoded);
	if (encoded && !enc) {
		debug('content encoded with unknown encoding, skip');
	}

	input.unpipe(output);
	var stream = input;

	if (encoded) {
		stream = stream.pipe(enc === 'gzip' ? zlib.createGunzip() : zlib.createInflate());
		response.removeHeader('Content-Encoding');
		response.removeHeader('Content-Length'); // use chunked encoding
	}

	stream.pipe(inject(session.clientCode(), response)).pipe(output);
}

/**
 * Returns a stream that injects given code into HTML
 * @param  {Buffer} code Code to inject
 * @return {stream.Transform}
 */
function inject(code, response) {
	var buf, injected = false;
	var m = htmlMatcher();

	return through(function(chunk, enc, next) {
		if (injected) {
			return next(null, chunk);
		}

		buf = buf ? Buffer.concat([buf, chunk]) : chunk;
		var ix = m.search(buf);
		if (ix !== -1) {
			debug('found injection pos at %d', ix);
			injected = true;
			updateLength(response, code.length);
			chunk = m.shift(buf);
			this.push(Buffer.concat([chunk, code, buf.slice(chunk.length)]));
			buf = null;
		} else {
			chunk = m.shift(buf);
			debug('pos not found, push processed %d of %d bytes', chunk.length, buf.length);
			this.push(chunk);
			if (chunk === buf) {
				buf = null;
			} else {
				buf = buf.slice(chunk.length);
			}
		}

		next();
	}, function(next) {
		if (!injected) {
			updateLength(response, code.length);
			buf && this.push(buf);
			this.push(code);
		}

		buf = null;
		next();
	});
}

function updateLength(response, delta) {
	var len = response.getHeader('Content-Length');
	if (len !== undefined) {
		response.setHeader('Content-Length', +len + delta);
	}
};