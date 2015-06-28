/**
 * Writes error response for given error
 */
'use strict';

var net = require('net');
var http = require('http');

var errorMessages = {
	'no-session': {
		code: 412,
		message: 'No Remote View session for given request'
	},
	'no-free-socket': {
		code: 408,
		message: 'No remote socket for this request'
	},
	'too-many-requests': {
		code: 429,
		message: 'Too many incoming requests'
	},
	'session-destroyed': {
		code: 410,
		message: 'User session is destroyed'
	},
	'quota-exceeded': {
		code: 403,
		message: 'Traffic quota for current session is exceeded'
	}
};

module.exports = function(res, error, message) {
	var err = getError(error, message);
	if (res instanceof net.Socket) {
		// send to raw TCP socket
		let response = 
			`HTTP/1.1 ${err.code} ${http.STATUS_CODES[err.code]}\r\n` +
			`Content-Type: text/plain\r\n` + 
			`Connection: close\r\n` +
			// `Content-Length: ${err.message.length}\r\n` +
			'\r\n';
			// XXX for some reason, Node.js HTTP parser fails to parse
			// responses with message body (maybe a CONNECT method limitation?)
			// So right now I’m not sending response body for raw sockets
			// + err.message;
		res.end(new Buffer(response));
	} else {
		res.writeHead(err.code, {
			'Content-Length': err.message.length,
			'Content-Type': 'text/plain',
			'Connection': 'close'
		});
		res.end(err.message);
	}
	return res;
};

function getError(error, message) {
	var code = 500;
	var responseMessage = message || 'Unknown error';
	if (typeof error === 'number') {
		code = error;
	} else if (error in errorMessages) {
		code = errorMessages[error].code;
		responseMessage = errorMessages[error].message;
	}

	return {
		code: code,
		message: responseMessage
	};
}