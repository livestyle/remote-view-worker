/**
 * Connects external TCP socket raw HTTP with given
 * response streams: redirects all socket data
 * to given response so it looks like native 
 * IncomingMessage/ServerResponse flow
 */
'use strict';

var stream = require('stream');
var debug = require('debug')('rv:worker:connect');
var httpParser = require('../http-header-parser');

module.exports = function(response) {
	return new ConnectStream(response);
};

class ConnectStream extends stream.Transform {
	constructor(response) {
		debug('created connect stream');
		super();
		this.response = response;
		this.parser = null;
		this._headerFlushed = false;
	}

	_transform(chunk, enc, next) {
		debug('transform');
		if (!this.parser) {
			this.parser = httpParser('response');
		}

		var ret = this.parser.execute(chunk);
		if (ret instanceof Error) {
			debug('parser error %o', ret);
			return next(ret);
		}

		if (this.parser.headers && !this._headerFlushed) {
			debug('flush http headers');
			this.flushHeader();
		}

		if (this.parser.body) {
			this.push(this.parser.body);
			this.parser.body = null;
		}
		next();
	}

	_flush(next) {
		debug('flush');
		if (this.parser) {
			this.parser.reset();
			this.parser = null;
		}
		next();
	}

	/**
	 * Flushes parsed HTTP header into ServerResponse stream
	 * @param  {httpParser} parser
	 * @param  {http.ServerResponse} response
	 */
	flushHeader() {
		var response = this.response;
		var parser = this.parser;
		response.statusCode = parser.statusCode;
		response.statusMessage = parser.statusMessage;
		Object.keys(parser.headers).forEach(function(name) {
			response.setHeader(name, parser.headers[name]);
		});
		this._headerFlushed = true;
		parser = response = null
	}
}