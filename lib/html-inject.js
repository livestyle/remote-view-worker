/**
 * A transform stream to inject custom HTML code into 
 * incoming socket response. This transformer
 * automatically decodes gzip stream, if required,
 * and injects given code right before
 * </head>, </body> or </html>
 */
'use strict'

var zlib = require('zlib');
var through = require('through2');
var combine = require('stream-combiner2');
var duplex = require('duplexer2');
var htmlMatcher = require('./html-token-matcher');
var debug = require('debug')('rv-worker');

// supported content types for injection
const supportedTypes = ['text/html'];

module.exports = function(req, res, code) {
	var pipeline = null;
	var output = through();
	var input = through(function(chunk, enc, next) {
		if (!pipeline) {
			pipeline = createPipeline(req, res, code);
			pipeline.pipe(output);
		}
		pipeline.write(chunk, enc, next);
	}, function(next) {
		pipeline.end();
		next();
	});

	return duplex(input, output);
};

function createPipeline(req, res, code) {
	var pipeline = [];

	var contentType = getContentType(res);
	if (supportedTypes.indexOf(contentType) === -1) {
		// unsupported type, do nothing
		return through();
	}

	var enc = (res.getHeader('content-encoding') || '').toLowerCase();
	if (enc) {
		let dec = decoder(enc, req, res);
		if (!dec) {
			return through();
		}

		pipeline.push(dec, updateLength(req, res));
	}

	pipeline.push(injector(code, req, res));
	return combine(pipeline);
}

function getContentType(res) {
	var contentType = res.getHeader('content-type') || '';
	return contentType.split(';')[0].toLowerCase();
}

/**
 * Creates decoder stream for given content encoding
 * @param  {String} enc Content encoding
 * @return {stream.Transform}
 */
function decoder(enc, req, res) {
	var dec;
	if (enc === 'gzip') {
		dec = zlib.createGunzip();
	}

	if (enc === 'deflate') {
		dec = zlib.createInflate();
	}

	if (dec) {
		return dec.once('end', function() {
			res.removeHeader('content-encoding');
		});
	}
}

/**
 * Returns a stream that injects given code into HTML
 * @param  {String|Buffer} code Code to inject
 * @return {stream.Transform}
 */
function injector(code, req, res) {
	if (!Buffer.isBuffer(code)) {
		code = new Buffer(code);
	}
	var injected = false;
	var m = htmlMatcher();
	var buf = new Buffer('');

	return through(function(chunk, enc, next) {
		if (injected) {
			return next(null, chunk);
		}

		buf = Buffer.concat([buf, chunk]);
		var ix = m.search(buf);
		if (ix !== -1) {
			injected = true;
			res.contentLength += code.toString().length;
			chunk = m.shift(buf);
			this.push(Buffer.concat([chunk, code, buf.slice(chunk.length)]));
			buf = null;
		}

		next();
	}, function(next) {
		if (!injected) {
			res.contentLength += code.toString().length;
			if (buf && buf.length) {
				this.push(buf);
			}
			this.push(code);
		}

		buf = null;
		next();
	});
}

function updateLength(req, res) {
	var buf = new Buffer('');
	return through(function(chunk, enc, next) {
		buf = Buffer.concat([buf, chunk]);
		next();
	}, function(next) {
		res.contentLength = buf.length;
		this.push(buf);
		buf = null;
		next();
	});
}