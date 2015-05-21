var http = require('http');
var net = require('net');
var url = require('url');

var s = http.createServer(function(req, res) {
	console.log('got request', req.headers);
	res.connection.end([
		'HTTP/1.1 200 OK',
		'X-Proxy-Agent: RV-Worker',
		'Content-Length: 94',
		'',
		'GET /index.html HTTP/1.1',
		'Host: localhost:9010',
		'Connection: close',
		'X-Forwarded-Proto: http'
	].join('\r\n'));
}).listen(9001, function() {
	console.log('connected');
	http.request({port: 9001}, function(res) {
		console.log(res.headers);
		res
		.on('data', function(chunk) {
			console.log('data\n%s', chunk);
		})
		.on('end', function() {
			s.close();
		});
	}).end();
});