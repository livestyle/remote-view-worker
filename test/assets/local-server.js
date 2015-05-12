/**
 * A simple local server implementation for testing
 */
'use strict'

var path = require('path');
var connect = require('connect');
var serveStatic = require('serve-static');
var basicAuth = require('basic-auth-connect');

module.exports = function(options) {
	var app = connect();
	app.use(serveStatic(options.docroot))
	app.use('/auth', basicAuth('admin', 'password'));
	app.use('/auth', function(req, res, next) {
		res.writeHead(200, {
			'content-type': 'text/plain'
		});
		var parts = req.headers.authorization.split(' ');
		var credentials = new Buffer(parts[1], 'base64').toString();

		res.end('Authorized as ' + credentials);
	});

	var server = app.listen(options.port);

	return {
		stop() {
			server.close();
		}
	};
};

if (require.main === module) {
	module.exports({
		docroot: path.resolve(__dirname, '../assets'),
		port: 9010
	});

	console.log('Started sample server on :9010');
}