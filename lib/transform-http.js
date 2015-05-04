/**
 * Transforms HTTP request header for stream:
 * replaces keys in header with given value
 */
'use strict'

var through = require('through2');
var duplexer = require('duplexer');
var HTTPHeader = require('./http-header');
var utils = require('./utils');

const BODY_SEP = new Buffer('\r\n\r\n');
const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;
const REQUEST_TIMEOUT = 30000;

module.exports = function(body, headers) {
	if (typeof body === 'object' && typeof body.pipe !== 'function') {
		headers = body;
		body = null;
	}

	var data = new Buffer('');
	var httpHeader = null;
	var headerWritten = false;
	var bodySize = 0;

	var closeHanging = utils.debounce(function() {
		input.end();
	}, REQUEST_TIMEOUT);

	var input = through(function(chunk, enc, next) {
		console.log('FIRST');
		closeHanging();

		if (!httpHeader) {
			// collect HTTP header first
			data = Buffer.concat([data, chunk]);
			var ix = data.indexOf(BODY_SEP);
			if (ix !== -1) {
				httpHeader = constructHttpHeader(data.slice(0, ix), headers);
				console.log('parsed header');
				console.log(httpHeader.toString());
				chunk = data.slice(ix + BODY_SEP.length);
				data = null;
			} else {
				return next();
			}
		}

		// here we already parsed header and we’re able
		// to properly handle body
		let size = getContentLength(httpHeader);
		if (!httpHeader.isResponse() && size === -1) {
			// for HTTP requests, there might be no size at all
			console.log('finishing request body');
			this.end();
		} else {
			bodySize += chunk.length;
			this.push(chunk);
			if (size !== -1 && bodySize >= size) {
				console.log('finishing body');
				this.end();
			}
		}

		next();
	});

	var pipeline = input;

	if (body) {
		pipeline = pipeline.pipe(body);
	}

	pipeline = pipeline.pipe(through(function(chunk, enc, next) {
		console.log('SECOND');
		if (!headerWritten && httpHeader) {
			console.log('Write HTTP header before body');
			headerWritten = true;
			httpHeader = null;
			this.push(Buffer.concat([httpHeader.toBuffer(), BODY_SEP]));
		}
		console.log('after pipe');
		console.log(chunk.toString());
		this.push(chunk);
		next();
	}));

	console.log(input === pipeline);
	return duplexer(input, pipeline);
};

function constructHttpHeader(buf, override) {
	var httpHeader = new HTTPHeader(buf);
	override && Object.keys(override).forEach(function(name) {
		if (!override[name]) {
			httpHeader.removeHeader(name);
		} else {
			httpHeader.setHeader(name, override[name]);
		}
	});
	return httpHeader;
}

function getContentLength(httpHeader) {
	if (httpHeader.hasHeader('content-length')) {
		var len = +httpHeader.getHeader('content-length');
		if (!isNaN(len)) {
			return len;
		}
	}

	return -1;
}

function getMaxBodySize(httpHeader) {
	var size = getContentLength(httpHeader);
	return size !== -1 ? size : MAX_REQUEST_BODY_SIZE;
}