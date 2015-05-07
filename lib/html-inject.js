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
var transformer = require('./transformer');
var debug = require('debug')('rv-worker');

// supported content types for injection
const supportedTypes = ['text/html'];
// character bytes used for searching
const bufLookup = '<>!-/bodyheatml'.split('').reduce(function(obj, ch) {
	obj[ch] = ch.charCodeAt(0);
	return obj;
}, {});

module.exports = function(code) {
	if (!Buffer.isBuffer(code)) {
		code = new Buffer(String(code));
	}

	var pipeline = [];
	var input = through().on('pipe', function(readable) {
		var res = readable.response;
		var dec;

		var contentType = res.getHeader('content-type');
		if (!contentType || supportedTypes.indexOf(contentType) === -1) {
			// unsupported type, do nothing
			return;
		}

		var enc = (res.getHeader('content-encoding') || '').toLowerCase();
		if (enc) {
			dec = decoder(enc);
			if (dec) {
				return debug('Unknown encoding %s, aborting', enc);
			}

			pipeline.push(dec.once('end', function() {
				res.removeHeader('content-encoding');
			}));
		}

		

	});



	return through(function(chunk, enc, next) {
		debug('piping %s: %s', name, chunk.toString());
		this.push(chunk);
		this.push(new Buffer('\nchunk'));
		next();
	}, function(next) {
		debug('done piping ' + name);
		// this.push(new Buffer('\nfinish'));
		next();
	});
};

/**
 * Creates decoder stream for given content encoding
 * @param  {String} enc Content encoding
 * @return {stream.Transform}
 */
function decoder(enc) {
	var stream;
	if (enc === 'gzip') {
		return zlib.createGunzip();
	}

	if (enc === 'deflate') {
		return zlib.createInflate();
	}
}

/**
 * Returns a replacer stream
 * @param  {Buffer} code
 * @param  {http.ServerResponse} res
 * @return {stream.Transform}
 */
function replacer(code, res) {
	var buf = new Buffer('');
	var replaced = false;
	var state = {offset: 0};
	return through(function(chunk, enc, next) {
		if (replaced) {
			return next(null, chunk);
		}

		buf = Buffer.concat([buf, chunk]);
	}, function() {
		
	});
}

function findMatch(buf, state) {
	var len = buf.length, last = len - 1;
	for (var i = state.offset; i < buf.length; i++) {
		let ch = buf[i];
		if (ch === bufLookup['<']) {

		} else {
			state.offset = i;
		}
	};
}