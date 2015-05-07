/**
 * Creates stream for transforming incoming raw HTTP socket
 * response up to given `res` server response. The server response
 * is used to set/get HTTP headers.
 * @param  {http.ServerResponse} res Server response stream, used to update headers
 * @returns {stream.Transform}
 */
'use strict'

var combine = require('stream-combiner2');
var through = require('through2');

const HTTPParser = process.binding('http_parser').HTTPParser;
const kOnHeadersComplete = HTTPParser.kOnHeadersComplete | 0;
const kOnBody = HTTPParser.kOnBody | 0;

var headerCompleteArgMap = [
	'versionMajor', 'versionMinor', 'headers', 'method',
	'url', 'statusCode', 'statusMessage', 'upgrade', 'shouldKeepAlive'
];

module.exports = function(res) {
	var headerParsed = false;
	var parser = new HTTPParser(HTTPParser.RESPONSE);
	parser[kOnHeadersComplete] = function() {
		var data = mapArgs(arguments, headerCompleteArgMap);
		headerParsed = true;
		parser.finish();

		res.statusCode = data.statusCode;
		res.statusMessage = data.statusMessage;

		var headers = compactHeaders(data.headers);
		Object.keys(headers).forEach(function(name) {
			res.setHeader(name, headers[name]);
		});
		
		parser = data = headers = null;
	};

	parser[kOnBody] = function(chunk, start, len) {
		stream.write(chunk.slice(start, start + len));
	};

	var stream = through(function(chunk, end, next) {
		if (headerParsed) {
			this.write(chunk);
			next();
		} else {
			let ret = parser.execute(chunk);
			if (ret instanceof Error) {
				return this.destroy(ret);
			}
		}
	});
	stream.response = res;

	return stream;
};

function mapArgs(args, map) {
	return map.reduce(function(obj, name, i) {
		obj[name] = args[i];
		return obj;
	}, {});
}

function compactHeaders(data) {
	var headers = {};
	for (var i = 0; i < data.length; i += 2) {
		let name = data[i].toLowerCase();
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