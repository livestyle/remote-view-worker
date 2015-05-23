/**
 * Compresses incoming response with Gzip
 */
'use strict'

var zlib = require('./zlib');
var transform = require('./transform');
var headerUtils = require('./header-utils');
var debug = require('debug')('rv:compress');

// supported content types for compression
const mimeTypes = [
	'text/plain', 'text/css', 'text/html',
	'text/javascript', 'application/x-javascript', 
	'application/xml', 'text/xml'
];

module.exports = function(req, res, code) {
	return transform(function() {
		if (headerUtils.matchesMime(res, mimeTypes) && !res.getHeader('Content-Encoding')) {
			debug('gzip encode');
			return zlib.encode(res, req.headers['accept-encoding']);
		}
	});
};