/**
 * Connects external TCP socket raw HTTP with given
 * response streams: redirects all socket data
 * to given response so it looks like native 
 * IncomingMessage/ServerResponse flow
 */
'use strict';

var through = require('through2');
var debug = require('debug')('rv:worker:connect');
var httpParser = require('../http-header-parser');

module.exports = function(response) {
	var parser = httpParser('response');
	var headerFlushed = false;
	return through(function(chunk, enc, next) {
		var ret = parser.execute(chunk);
		if (ret instanceof Error) {
			return next(ret);
		}

		if (parser.headers && !headerFlushed) {
			headerFlushed = true;
			flushHeader(parser, response);
		}

		this.push(parser.body);
		parser.body = null;
		next();
	}, function(next) {
		parser.reset();
		parser = null;
		next();
	});
};

/**
 * Flushes parsed HTTP header into ServerResponse stream
 * @param  {httpParser} parser
 * @param  {http.ServerResponse} response
 */
function flushHeader(parser, response) {
	response.statusCode = parser.statusCode;
	response.statusMessage = parser.statusMessage;
	Object.keys(parser.headers).forEach(function(name) {
		response.setHeader(name, parser.headers[name]);
	});
}