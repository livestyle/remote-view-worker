/**
 * A simple reverse tunnel connection
 */
'use strict'

var net = require('net');
var through = require('through2');
var combine = require('stream-combiner2');

const CRLF = new Buffer('\r\n');
const HEADER_SEP = Buffer.concat([CRLF, CRLF]);

module.exports = function(port, callback) {
	var socket = net.connect({port: port}, function() {
		var buf = new Buffer('');
		var remote = null;

		var output = through();
		var input = through(function(chunk, enc, next) {
			if (!remote) {
				buf = Buffer.concat([buf, chunk]);
				let ix = buf.indexOf(HEADER_SEP);
				if (ix !== -1) {
					remote = net.connect(getHost(buf.slice(0, ix)), function() {
						next(null, buf);
						buf = null;
					});
					input.unpipe(output);
					return input.pipe(remote).pipe(output);
				}
			} else {
				this.push(chunk, enc);
			}

			next();
		}, function(next) {
			next();
		});

		socket.pipe( combine(input, output) ).pipe(socket);
		callback && callback(socket);
	});
	return socket;
};

function getHost(buf) {
	var hostname = null;
	buf.toString().split(CRLF).some(function(line) {
		var m = line.match(/^host\s*:\s*(.+)$/i);
		return m ? hostname = m[1] : false;
	});
	if (hostname) {
		var parts = hostname.split(':');
		return {
			host: parts.shift(),
			port: parts[0] || 80
		};
	}
}