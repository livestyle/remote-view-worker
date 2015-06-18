/**
 * A transform stream to inject custom HTML code into 
 * incoming socket response. This transformer
 * automatically decodes gzip stream, if required,
 * and injects given code right before
 * </head>, </body> or </html>
 */
'use strict';

var zlib = require('zlib');
var stream = require('stream');
var duplexer = require('duplexer2');
var debug = require('debug')('rv:worker:inject');
var htmlMatcher = require('../html-token-matcher');
var headerUtils = require('../header-utils');
var noop = require('../utils').noopStream;

// supported content types for injection
const mimeTypes = ['text/html'];

module.exports = function(session, request, response) {
	var output = noop();
	var input = new IntputStream(session, response, output);
	return duplexer(input, output);
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

	stream.pipe(new InjectStream(session.clientCode(), response)).pipe(output);
}

class IntputStream extends stream.Transform {
	constructor(session, response, output) {
		super();
		this.session = session;
		this.response = response;
		this.output = this.pipe(output);
		this._processed = false;
	}

	_transform(chunk, enc, next) {
		if (!this._processed) {
			this._processed = true;
			updatePipeline(this.session, this.response, this, this.output);
		}

		next(null, chunk);
	}
}

class InjectStream extends stream.Transform {
	constructor(code, response) {
		super();
		this.code = code;
		this.response = response;
		this._buf = null;
		this._injected = false;
		this.m = htmlMatcher();
	}

	_transform(chunk, enc, next) {
		if (this._injected) {
			return next(null, chunk);
		}

		var m = this.m;
		this._buf = this._buf ? Buffer.concat([this._buf, chunk]) : chunk;
		var ix = m.search(this._buf);
		if (ix !== -1) {
			debug('found injection pos at %d', ix);
			this._injected = true;
			this.updateLength();
			chunk = m.shift(this._buf);
			this.push(Buffer.concat([chunk, this.code, this._buf.slice(chunk.length)]));
			this._buf = null;
		} else {
			chunk = m.shift(this._buf);
			debug('pos not found, push processed %d of %d bytes', chunk.length, this._buf.length);
			this.push(chunk);
			if (chunk === this._buf) {
				this._buf = null;
			} else {
				this._buf = this._buf.slice(chunk.length);
			}
		}

		next();
	}

	_flush(next) {
		if (!this._injected) {
			updateLength();
			this._buf && this.push(this._buf);
			this.push(this.code);
		}

		this._buf = this.response = this.code = null;
		next();
	}

	updateLength() {
		var len = this.response.getHeader('Content-Length');
		if (len !== undefined) {
			this.response.setHeader('Content-Length', +len + this.code.length);
		}
	}
}