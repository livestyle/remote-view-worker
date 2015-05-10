/**
 * Encodes or decodes incoming HTTP response data 
 * with Gzip or Deflate algorithm, if required
 */
'use strict'

var zlib = require('zlib');
var combine = require('stream-combiner2');
var through = require('through2');

module.exports.decode = function(res, encoding) {
	var decoder;
	if (!encoding) {
		encoding = (res.getHeader('Content-Encoding') || '').toLowerCase();
	}
	if (encoding === 'gzip') {
		decoder = zlib.createGunzip();
	} else if (encoding === 'deflate') {
		decoder = zlib.createInflate();
	}

	if (!decoder) {
		// content either is not encoded 
		// or encoded with unknown encoder
		return through();
	}

	res.removeHeader('Content-Encoding');
	return combine(decoder, updateContentLength(res));
};

module.exports.encode = function(res, encoding) {
	var encoder, enc;
	(encoding || '').toLowerCase().split(',').some(function(_enc) {
		enc = _enc;
		if (enc === 'gzip') {
			return encoder = zlib.createGzip();
		} else if (enc === 'deflate') {
			return encoder = zlib.createDeflate();
		}
	});

	if (!encoder) {
		return through();
	}

	res.setHeader('Content-Encoding', enc);
	return combine(encoder, updateContentLength(res));
};

/**
 * A helper accumulator stream for updating 
 * `Content-Length` header in given response stream 
 * with actual incoming data length
 * @param {http.ServerResponse} res
 * @return {stream.Transform}
 */
function updateContentLength(res) {
	var buf = new Buffer('');
	return through(function(chunk, enc, next) {
		buf = Buffer.concat([buf, chunk]);
		next();
	}, function(next) {
		res.setHeader('Content-Length', buf.length);
		this.push(buf);
		buf = null;
		next();
	});
}