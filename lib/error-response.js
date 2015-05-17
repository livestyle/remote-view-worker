/**
 * Writes error response for given error
 */
'use strict'
var net = require('net');
var http = require('http');

var errorMessages = {
	'no-session': {
		code: 403,
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
		code: 500,
		message: 'User session is destroyed'
	}
};

module.exports = function(res, error, message) {
	var err = getError(error, message);
	if (res instanceof net.Socket) {
		// send to raw TCP socket
		res.end(new Buffer([
			`HTTP/1.1 ${err.code} ${http.STATUS_CODES[err.code]}`,
			`Content-Length: ${err.message.length}`,
			`Content-Type: text/plain`,
			`Connection: close`,
			'',
			err.message
		].join('\r\n')));
	} else {
		res.writeHead(err.code, {
			'Content-Length': err.message.length,
			'Content-Type': 'text/plain'
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