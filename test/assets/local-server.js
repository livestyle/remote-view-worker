/**
 * A simple local server implementation for testing
 */
'use strict'

var fs = require('fs');
var path = require('path');
var connect = require('connect');
var serveStatic = require('serve-static');
var basicAuth = require('basic-auth-connect');
var bodyParser = require('body-parser');
var multipart = require('connect-multiparty');

module.exports = function(options) {
	var app = connect();
	app.use(serveStatic(options.docroot));
	app.use(bodyParser.urlencoded({extended: true}));

	// for testing HTTP basic auth requests
	app.use('/auth', basicAuth('admin', 'password'));
	app.use('/auth', function(req, res, next) {
		var parts = req.headers.authorization.split(' ');
		var credentials = new Buffer(parts[1], 'base64').toString();
		plain(res, 'Authorized as ' + credentials);
	});

	// for testing POST data fields
	app.use('/post', function(req, res, next) {
		plain(res, 'Posted ' + JSON.stringify(req.body));
	});

	// for testing file uploads
	app.use('/upload', multipart());
	app.use('/upload', function(req, res) {
		var file = req.files.file;
		plain(res, `Uploaded file: ${file.name} (${file.size} bytes)`);
		fs.unlinkSync(file.path); // cleanup
	});

	// gzip output
	app.use('/compressed', function(req, res) {
		var file = path.join(options.docroot, 'compressed.html.gz');
		res.writeHead(200, {
			'Content-Type': 'text/html',
			'Content-Encoding': 'gzip'
		});
		fs.createReadStream(file).pipe(res);
	});

	var server = app.listen(options.port);

	return {
		stop() {
			server.close();
		}
	};
};

function plain(res, text) {
	res.writeHead(200, {
		'content-type': 'text/plain'
	});
	res.end(text);
}

if (require.main === module) {
	module.exports({
		docroot: path.resolve(__dirname, '../assets'),
		port: 9010
	});

	console.log('Started sample server on :9010');
}