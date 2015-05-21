'use strict';

var http = require('http');
var net = require('net');
var urlUtils = require('url');

var tunnel;

var server = http.createServer(function(req, res) {
	console.log('main connection');
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end('okay');
})
.on('connect', function(req, socket, head) {
	console.log('remote connect');
	socket.write(
		'HTTP/1.1 200 Connection Established\r\n' +
		'X-RV-Host: http://www.google.com\r\n' +
		'Proxy-agent: Node-Proxy\r\n' +
		'\r\n'
	);

	setTimeout(function() {
		console.log('making tunnel request');
		socket.write('GET / HTTP/1.1\r\n' +
			'Host: www.google.com\r\n' +
			'Connection: close\r\n' +
		'\r\n');
		socket.on('data', function(chunk) {
			console.log(chunk.toString());
		});
		socket.on('end', function() {
			socket.end();
			server.close();
		});
	}, 100);
});

server.listen(1337, function() {
	console.log('making request');
	http.request({
		port: 1337,
		hostname: '127.0.0.1',
		method: 'CONNECT',
		headers: {
			'x-rv-host': 'http://www.google.com'
		}
	})
	.on('connect', function(res, socket, head) {
		console.log('received connect');

		var url = urlUtils.parse(res.headers['x-rv-host']);
		var tunnel = net.connect(url.port || 80, url.hostname, function() {
			socket.pipe(tunnel).pipe(socket);
		});
	}).end();
});