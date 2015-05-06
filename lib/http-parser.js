const HTTPParser = process.binding('http_parser').HTTPParser;
const kOnHeadersComplete = HTTPParser.kOnHeadersComplete | 0;
const kOnBody = HTTPParser.kOnBody | 0;
const kOnMessageComplete = HTTPParser.kOnMessageComplete | 0;

var create = module.exports = function(type, callback) {
	var parser = new HTTPParser(type);
	parser[kOnHeadersComplete] = onHeaderComplete(callback);
	parser[kOnBody] = function(chunk, start, len) {
		console.log('on body', chunk.slice(start, start + len).toString());
	};

	parser[kOnMessageComplete] = function() {
		console.log('on message complete');
	};
	return parser;
};

module.exports.request = function(callback) {
	return create(HTTPParser.REQUEST, callback);
};

module.exports.response = function(callback) {
	return create(HTTPParser.RESPONSE, callback);
};

function onHeaderComplete(callback) {
	return function(versionMajor, versionMinor, headers, method,
                            url, statusCode, statusMessage, upgrade,
                            shouldKeepAlive) {
		callback({
			versionMajor: versionMajor,
			versionMinor: versionMinor,
			headers: headers,
			method: method,
			url: url,
			statusCode: statusCode,
			statusMessage: statusMessage,
			upgrade: upgrade,
			shouldKeepAlive: shouldKeepAlive
		});
		return false;
	}
}