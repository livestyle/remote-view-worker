/**
 * A simple local server implementation for testing
 */
'use strict'

var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');

module.exports = function(options) {
	var app = connect();
	app.use(serveStatic(options.docroot))

	var server = http.createServer(app).listen(options.port);

	return {
		stop() {
			server.close();
		}
	};
};