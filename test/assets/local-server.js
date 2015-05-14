#!/usr/bin/env iojs
/**
 * A simple local server implementation for testing
 */
'use strict'

var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var connect = require('connect');
var serveStatic = require('serve-static');
var basicAuth = require('basic-auth-connect');
var bodyParser = require('body-parser');
var multipart = require('connect-multiparty');
var ws = require('websocket');

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


	var httpServer, httpsServer, wsServer;
	if (options.port) {
		httpServer = http.createServer(app).listen(options.port);
		wsServer = new ws.server({
			httpServer: httpServer,
			autoAcceptConnections: true
		});
		wsServer.on('connect', function(client) {
			client.on('message', function(msg) {
				if (msg.utf8Data === 'ping') {
					client.send('pong');
				}
			});
		});
	}
	
	if (options.sslPort) {
		httpsServer = https.createServer({
			key: fs.readFileSync( path.resolve(__dirname, '../cert/server.key') ),
			cert: fs.readFileSync( path.resolve(__dirname, '../cert/server.crt') )
		}, app).listen(options.sslPort);
	}

	return {
		stop() {
			wsServer && wsServer.shutDown();
			httpServer && httpServer.close();
			httpsServer && httpsServer.close();
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
		docroot: __dirname,
		port: 9010,
		sslPort: 9443
	});

	console.log('Started http server on :9010 and https server of :9443');
}