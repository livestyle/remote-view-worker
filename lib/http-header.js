/**
 * Parses raw HTTP request header into modifyable
 * object that san be serialized back to string or buffer
 */
'use strict'

const HEADER_SEP = '\r\n';

module.exports = class HTTPHeader {
	constructor(data) {
		data = data.toString('utf8');
		var lines = data.split(HEADER_SEP);

		this.statusLine = lines[0];
		this._headers = {};
		for (let i = 1; i < lines.length; i++) {
			let line = lines[i];
			if (!line) {
				break;
			}

			let header = parseHeader(line);
			this.setHeader(header.name, header.value);
		}
	}

	setHeader(name, value) {
		// TODO headers must be array, not hash, 
		// since there could be duplicated headers
		// see RFC2616, section 4.2
		// https://github.com/joyent/node/blob/master/lib/_http_incoming.js#L142
		this._headers[name.toLowerCase()] = value;
	}

	getHeader(name) {
		return this._headers[name];
	}

	removeHeader(name) {
		delete this._headers[name];
	}

	hasHeader(name) {
		return name in this._headers;
	}

	getAllHeaders() {
		var self = this;
		return Object.keys(this._headers).reduce(function(obj, key) {
			obj[key] = this[key];
		}, {});
	}

	/**
	 * Check if current HTTP header is for response
	 * @return {Boolean}
	 */
	isResponse() {
		return /^HTTP\/\d/.test(this.statusLine);
	}

	getContentLength() {
		if (this.hasHeader('content-length')) {
			var len = +this.getHeader('content-length');
			if (!isNaN(len)) {
				return len;
			}
		}

		return -1;
	}

	/**
	 * Adjusts Content-Length header (if exists) by given
	 * delta
	 * @param  {Number} delta
	 * @return {Number} adjusted content length
	 */
	adjustContentLength(delta) {
		var len = this.getContentLength();
		if (len === -1) {
			len = 0
		}

		len = Math.max(0, this.getContentLength() + delta);
		this.setHeader('content-length', len);
		return len;
	}

	toString() {
		var headers = this._headers;
		return Object.keys(headers).reduce(function(prev, name) {
			return prev + HEADER_SEP + transformName(name) + ': ' + headers[name];
		}, this.statusLine);
	}

	toBuffer() {
		return new Buffer(this.toString());
	}
}

function parseHeader(line) {
	var parts = line.split(':');
	return {
		name: parts.shift().toLowerCase().trim(),
		value: parts.join(':').trim()
	};
}

function transformName(name) {
	return name[0].toUpperCase() + name.slice(1).replace(/-\w/g, function(str) {
		return str.toUpperCase();
	});
}