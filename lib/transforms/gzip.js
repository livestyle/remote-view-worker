/**
 * Tries to encode transmitted data with gzip
 */
'use strict';

var zlib = require('zlib');
var stream = require('stream');
var debug = require('debug')('rv:worker:gzip');
var headerUtils = require('../header-utils');
var injectStream = require('../stream/inject');

// supported content types for compression
const mimeTypes = [
	'text/plain', 'text/css', 'text/html',
	'text/javascript', 'application/x-javascript', 'application/javascript',
	'application/xml', 'text/xml'
];

module.exports = function(request, response) {
	var stream = injectStream(injector);
	stream.request = request;
	stream.response = response;
	return stream.once('finish', onFinish);
};

function injector() {
	if (this.response.getHeader('Content-Encoding')) {
		return debug('content already encoded');
	}

	var enc = headerUtils.supportedEncoding(this.request.headers['accept-encoding']);
	if (!enc) {
		return debug('client does not support content encoding, skip');
	}

	debug('encode with %s', enc);
	this.response.removeHeader('Content-Length');
	this.response.setHeader('Content-Encoding', enc);
	this.inject(enc === 'gzip' ? zlib.createGzip() : zlib.createDeflate());
}


function onFinish() {
	this.request = this.response = null;
}