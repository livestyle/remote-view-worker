/**
 * Compresses incoming response with Gzip
 */
'use strict'

var zlib = require('zlib');
var through = require('through2');
var duplex = require('duplexer2');
var combine = require('stream-combiner2');
var debug = require('debug')('rv-worker');

const supportedTypes = [
	'text/plain', 'text/css', 'text/html',
	'text/javascript', 'application/x-javascript', 
	'application/xml', 'text/xml'
];

module.exports = function(req, res) {
	var pipeline = null;
	var output = through();
	var input = through(function(chunk, enc, next) {
		if (!pipeline) {
			pipeline = createPipeline(req, res);
			pipeline.pipe(output);
		}
		pipeline.write(chunk, enc, next);
	}, function(next) {
		pipeline.end();
		next();
	});

	return duplex(input, output);
};

function createPipeline(req, res) {
	if (res.contentEncoding || supportedTypes.indexOf(res.contentType) === -1) {
		// content is already encoded or unsupported
		// content type, do nothing
		return through();
	}

	var pipeline = [];
	var encoder = null, enc;
	var acceptEnc = (req.headers['accept-encoding'] || '').toLowerCase().split(',');
	while (enc = acceptEnc.shift().trim()) {
		if (enc === 'gzip' || enc === 'deflate') {
			encoder = enc === 'gzip' ? zlib.createGzip() : zlib.createDeflate();
			res.contentEncoding = enc;
			break;
		}
	}

	return encoder 
		? combine(encoder, updateLength(req, res)) 
		: through();
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