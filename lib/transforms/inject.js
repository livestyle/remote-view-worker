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
var debug = require('debug')('rv:worker:inject');
var htmlMatcher = require('../html-token-matcher');
var headerUtils = require('../header-utils');
var injectStream = require('../stream/inject');

// supported content types for injection
const mimeTypes = ['text/html'];

module.exports = function(session, request, response) {
	var stream = injectStream(injector);
	stream.session = session;
	stream.request = request;
	stream.response = response;
	return stream.once('finish', onFinish);
};

function injector() {
	// check if we have to transform this stream
	if (!headerUtils.matchesMime(this.response, mimeTypes)) {
		debug('unsupported mime-type, skip');
		return;
	}

	var encoded = this.response.getHeader('Content-Encoding');
	var enc = headerUtils.supportedEncoding(encoded);
	if (encoded && !enc) {
		debug('content encoded with unknown encoding, skip');
		return;
	}

	var decode = null;
	if (encoded) {
		decode = (enc === 'gzip') ? zlib.createGunzip() : zlib.createInflate();
		this.response.removeHeader('Content-Encoding');
		this.response.removeHeader('Content-Length'); // use chunked encoding
	}

	this.inject(decode, new InjectStream(this.session.clientCode(), this.response));
}

function onFinish() {
	this.request = this.response = this.session = null;
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
			this.updateLength();
			this._buf && this.push(this._buf);
			this.push(this.code);
		}

		this._buf = this.response = this.code = this.m = null;
		next();
	}

	updateLength() {
		var len = this.response.getHeader('Content-Length');
		if (len !== undefined) {
			this.response.setHeader('Content-Length', +len + this.code.length);
		}
	}
}