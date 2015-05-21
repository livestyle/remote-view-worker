/**
 * Connects external TCP socket raw HTTP with given
 * request and response streams: redirects all socket data
 * to given response so it looks like native 
 * IncomingMessage/ServerResponse flow
 */
'use strict'

var through = require('through2');

const HTTPParser = process.binding('http_parser').HTTPParser;
const kOnHeadersComplete = HTTPParser.kOnHeadersComplete | 0;
const kOnBody = HTTPParser.kOnBody | 0;
const CRLF = '\r\n';

var headerCompleteArgMap = [
	'versionMajor', 'versionMinor', 'headers', 'method',
	'url', 'statusCode', 'statusMessage', 'upgrade', 'shouldKeepAlive'
];

/**
 * @param {http.IncomingMessage} req Incoming request stream
 * @param  {http.ServerResponse} res Server response stream, used to update headers
 * @returns {stream.Transform}
 */
module.exports = function(req, res) {
	var headerParsed = false;
	var parser = new HTTPParser(HTTPParser.RESPONSE);
	parser[kOnHeadersComplete] = function() {
		var data = mapArgs(arguments, headerCompleteArgMap);
		headerParsed = true;

		res.statusCode = data.statusCode;
		res.statusMessage = data.statusMessage;

		var headers = compactHeaders(data.headers);
		Object.keys(headers).forEach(function(name) {
			res.setHeader(name, headers[name]);
		});
		
		parser = data = headers = null;
	};

	parser[kOnBody] = function(chunk, start, len) {
		stream.push(chunk.slice(start, start + len));
	};

	var stream = through(function(chunk, end, next) {
		if (headerParsed) {
			return next(null, chunk);
		}

		console.log('parsing\n%s', chunk);
		let ret = parser.execute(chunk);
		if (ret instanceof Error) {
			return this.destroy(ret);
		}
		next();
	});
	return stream;
};

/**
 * Constructs raw HTTP request header from http.IncomingMessage stream
 * optionally overriding HTTP headers
 * @param  {http.IncomingMessage} req Stream with incoming request
 * @return {String}
 */
module.exports.createHTTPRequestHeader = function(req, headers) {
	headers = Object.keys(headers || {}).reduce(function(obj, key) {
		obj[normalizeHeaderName(key)] = headers[key];
		return obj;
	}, {});

	var overridden = {};
	
	var lines = [req.method + ' ' + req.url + ' HTTP/' + req.httpVersion];
	for (var i = 0; i < req.rawHeaders.length; i += 2) {
		let normName = normalizeHeaderName(req.rawHeaders[i]);
		let value = req.rawHeaders[i + 1];

		if (normName in headers) {
			overridden[normName] = true;
			// null value means header removal
			if (headers[normName] === null) {
				continue;
			}
			value = headers[normName];
		}

		lines.push(normName + ': ' + value);
	}

	// add additional headers that were not overridden
	Object.keys(headers).forEach(function(name) {
		if (!overridden[name]) {
			lines.push(name + ': ' + headers[name]);
		}
	});

	lines.push(CRLF);
	return lines.join(CRLF);
};

function mapArgs(args, map) {
	return map.reduce(function(obj, name, i) {
		obj[name] = args[i];
		return obj;
	}, {});
}

function _toUpperCase(str) {
	return str.toUpperCase();
}

function normalizeHeaderName(name) {
	return name.toLowerCase().replace(/^\w|\-\w/g, _toUpperCase);
}

function compactHeaders(data) {
	var headers = {};
	for (var i = 0; i < data.length; i += 2) {
		let name = normalizeHeaderName(data[i]);
		let value = data[i + 1];
		if (name in headers) {
			if (!Array.isArray(headers[name])) {
				headers[name] = [headers[name]];
			}
			headers[name].push(value);
		} else {
			headers[name] = value;
		}
	}

	return headers;
}