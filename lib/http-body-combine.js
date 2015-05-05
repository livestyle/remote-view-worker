/**
 * Combines given HTTP body transformers into a single
 * stream and ensures each stream will receive `httpHeader`
 * property 
 */
'use strict'

var combine = require('stream-combiner2');

module.exports = function() {
	var streams;
  	if (arguments.length == 1 && Array.isArray(arguments[0])) {
		streams = arguments[0]
	} else {
		streams = Array.prototype.slice.call(arguments);
	}

	return combine(streams).on('header', function(header) {
		for (var i = 0; i < streams.length; i++) {
			streams[i].httpHeader = header;
			streams[i].once('end', removeHeader);
		}
	});
};

function removeHeader() {
	delete this.httpHeader;
}