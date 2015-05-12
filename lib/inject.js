/**
 * A transform stream to inject custom HTML code into 
 * incoming socket response. This transformer
 * automatically decodes gzip stream, if required,
 * and injects given code right before
 * </head>, </body> or </html>
 */
'use strict'

var through = require('through2');
var combine = require('stream-combiner2');
var debug = require('debug')('rv-worker');
var zlib = require('./zlib');
var transform = require('./transform');
var headerUtils = require('./header-utils');
var htmlMatcher = require('./html-token-matcher');

// supported content types for injection
const mimeTypes = ['text/html'];

module.exports = function(req, res, code) {
	return transform(function() {
		if (headerUtils.matchesMime(res, mimeTypes)) {
			return combine(zlib.decode(res), inject(code, res));
		}
	});
};

/**
 * Returns a stream that injects given code into HTML
 * @param  {String|Buffer} code Code to inject
 * @return {stream.Transform}
 */
function inject(code, res) {
	if (!Buffer.isBuffer(code)) {
		code = new Buffer(code);
	}

	var injected = false;
	var m = htmlMatcher();
	var buf = new Buffer('');
	var updateLength = function() {
		res.setHeader('Content-Length', headerUtils.getLength(res) + code.length);
	};

	return through(function(chunk, enc, next) {
		if (injected) {
			return next(null, chunk);
		}

		buf = Buffer.concat([buf, chunk]);
		var ix = m.search(buf);
		if (ix !== -1) {
			injected = true;
			updateLength();
			chunk = m.shift(buf);
			this.push(Buffer.concat([chunk, code, buf.slice(chunk.length)]));
			buf = null;
		}

		next();
	}, function(next) {
		if (!injected) {
			updateLength();
			if (buf && buf.length) {
				this.push(buf);
			}
			this.push(code);
		}

		buf = null;
		next();
	});
}