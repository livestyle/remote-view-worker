/**
 * Writes error response for given error
 */
'use strict'

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
		message: 'user session is destroyed'
	}
};

module.exports = function(req, error, message) {
	var code = 500;
	var responseMessage = message || 'Unknown error';
	if (typeof error === 'number') {
		code = error;
	} else if (error in errorMessages) {
		code = errorMessages[error].code;
		responseMessage = errorMessages[error].message;
	}

	req.writeHead(code, {
		'Content-Length': responseMessage.length,
		'Content-Type': 'text/plain'
	});
	req.end(responseMessage);
};