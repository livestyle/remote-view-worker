/**
 * Transforms HTTP request header for stream:
 * replaces keys in header with given value
 */
'use strict'

var through = require('through2');
var combine = require('stream-combiner2');
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

	var output = through();
	if (!body) {
		body = through();
	}

	var dumpHeader = function() {
		if (!headerWritten && httpHeader) {
			headerWritten = true;
			output.push(Buffer.concat([httpHeader.toBuffer(), BODY_SEP]));
		}
	};

	// dump HTTP header into body stream before any data 
	// chunk is written
	body
	.once('data', dumpHeader)
	.once('end', function() {
		body.removeListener('data', dumpHeader);
		dumpHeader();
		delete body.httpHeader;
	})
	.pipe(output);

	var input = through(function(chunk, enc, next) {
		if (!httpHeader) {
			// collect HTTP header first
			data = Buffer.concat([data, chunk]);
			var ix = data.indexOf(BODY_SEP);
			if (ix !== -1) {
				httpHeader = body.httpHeader = constructHttpHeader(data.slice(0, ix), headers);
				body.emit('header', httpHeader);
				chunk = data.slice(ix + BODY_SEP.length);
				data = null;
			} else {
				return next();
			}
		}

		// here we already have parsed header and we’re able
		// to properly handle body
		let size = httpHeader.getContentLength();
		if (!httpHeader.isResponse() && size === -1) {
			// for HTTP requests, there might be no size at all
			body.push(null);
			this.end();
		} else {
			bodySize += chunk.length;
			body.write(chunk);
			if (size !== -1 && bodySize >= size) {
				body.push(null);
				this.end();
			}
		}

		next();
	});

	return combine(input, output);
};

function constructHttpHeader(buf, override) {
	var httpHeader = new HTTPHeader(buf);
	override && Object.keys(override).forEach(function(name) {
		if (override[name] === null) {
			httpHeader.removeHeader(name);
		} else {
			httpHeader.setHeader(name, override[name]);
		}
	});
	return httpHeader;
}