/**
 * Returns session object for given request.
 * Session object controls access to user resources
 * and manages socket connections
 */
'use strict'

var domain = require('domain');
var urlUtils = require('url');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('rv:worker');
var through = require('through2');
var extend = require('xtend');
var onFinished = require('on-finished');
var errorResponse = require('./error-response');
var connect = require('./connect');
var inject = require('./inject');
var compress = require('./compress');
var utils = require('./utils');

const ACCEPT_SOCKET = new Buffer('HTTP/1.1 200 OK\r\nX-Proxy-Agent: RV-Worker\r\n');
const CRLF = new Buffer('\r\n');
			

var defaultOptions = {
	// max amount of pending HTTP requests for tunneling
	maxQueue: 100,

	// how much time (ms) to wait until next free tunnel socket
	// will be available (e.g. time to keep pending HTTP in queue)
	socketWaitTimeout: 30000,

	// time (ms) to keep socket connection alive when no data 
	// is transmitted
	requestTimeout: 30000
};

module.exports = class Session extends EventEmitter {
	constructor(data, options) {
		super();
		this.data = data;
		this.sockets = [];
		this.options = extend({}, defaultOptions, options || {});
		this._destroyed = false;
		this._queue = [];
		this._queueTimer = utils.timer(function() {
			debug('freeing queued %d connections', this._queue.length);
			var queueItem;
			while (queueItem = this._queue.shift()) {
				errorResponse(queueItem[1], 'no-free-socket');
			}
		}.bind(this), this.options.socketWaitTimeout);

		var self = this;
		// this.on('activity', function() {
		// 	if (self._queue.length) {
		// 		debug('redirect queued connection');
		// 		self.redirect.apply(self, self._queue.shift());
		// 	}
		// });
		this
		.on('close', function(socket) {
			utils.removeFromArray(this.sockets, socket);
		})
		.on('socket', function() {
			if (this._queue.length) {
				debug('redirect queued connection');
				this.redirect.apply(this, this._queue.shift());
			}
		});



		// var self = this;
		// var popQueue = function() {
		// 	if (self._queue.length) {
		// 		debug('redirect queued connection');
		// 		self.redirect.apply(self, self._queue.shift());
		// 	}
		// };
		// this.on('socket', function() {
		// 	// popQueue();
		// 	setImmediate(popQueue);
		// });
	}

	addSocket(socket) {
		if (this.sockets.indexOf(socket) !== -1) {
			return debug('socket is already in pool');
		}

		if (!this._destroyed && this.data.maxConnections > this.sockets.length) {
			debug('socket connected for session %s', this.data.sessionId);
			
			var self = this;
			socket
			.once('end', function() {
				// explicitly close half-opened socket
				this.end();
			})
			.once('close', function() {
				debug('socket removed from session %s', self.data.sessionId);
				socket.removeListener('timeout', onSocketTimeout);
				socket.destroy();
				self.emit('close', socket);
			})
			// .once('ready', function() {
			// 	this.available = true;
			// 	self.emit('ready', this);
			// })
			.setTimeout(this.options.requestTimeout, onSocketTimeout);
			
			this.sockets.push(socket);
			process.nextTick(function() {
				self.emit('socket', socket);
			});
		} else {
			// Error: too many sockets
			if (!this._destroyed) {
				debug('Too many open sockets: %d + 1', this.sockets.length);
			}
			socket.destroy();
		}
	}

	/**
	 * Redirects HTTP request to one of the available
	 * user sockets. If no free socket, request is queued
	 * until new socket is opened. If no free socket is
	 * available for queued request during timeout,
	 * the connection is closed with error
	 * @param {http.IncomingMessage} req
	 * @param {http.ServerResponse} res
	 */
	redirect(req, res, head) {
		var socket = this.availableSocket();
		if (!socket) {
			// no available socket, add request to queue
			// until next free socket will be available
			return this.addToQueue(req, res, head);
		}

		// socket.available = false;
		this._redirect(socket, req, res, head);
	}

	/**
	 * Returns first socket ready for tunneling
	 * @return {net.Socket}
	 */
	availableSocket() {
		return this.sockets.shift();
		// var socket;
		// this.sockets.some(function(s) {
		// 	if (s.available) {
		// 		return socket = s;
		// 	}
		// });
		// return socket;
	}

	_redirect(socket, req, res, head) {
		var d = domain.create();
		d.on('error', function(err) {
			// TODO log error here
			socket.destroy();
			req.connection.destroy();
			try {
				errorResponse(res, 500);
			} catch (e) {
				res.connection && res.connection.destroy();
			}
			this.emit('error', err);
		}.bind(this));

		d.add(req);
		d.add(res);
		d.add(socket);

		// run tunneling in domain to catch all possible errors in streams
		var self = this;
		d.run(function() {
			debug('bouncing to %s', self.data.localSite);
			socket.write(self.requestPayload(req, head));
			if (req.headers['upgrade']) {
				// a WebSocket connection, use different strategy
				socket.pipe(res).pipe(socket);
			} else {
				// regular HTTP connection
				onFinished(res, function() {
					req.connection.destroy();
					socket.destroy();	
				});

				req
				.pipe(socket)
				.pipe(connect(req, res))
				.pipe(inject(self, req, res))
				.pipe(compress(req, res))
				.pipe(res);
			}
		});
	}

	/**
	 * Queues incoming HTTP connection to use local web-site
	 * until first free socket is available. If no free socket
	 * is available during some period of time, connection
	 * is closed with error
	 * @param  {ClientRequest} req
	 * @param  {ServerResponse} res
	 * @param  {Function} bounce Bouncing (redirect) function
	 */
	addToQueue(req, res) {
		debug('add connection to queue');
		if (this._destroyed) {
			return errorResponse(res, 'session-destroyed');
		}

		if (this._queue.length >= this.options.maxQueue) {
			return errorResponse(res, 'too-many-requests');
		}

		this._queue.push(utils.toArray(arguments));
		this._queueTimer.restart();
	}

	requestPayload(req, head) {
		var url = urlUtils.parse(this.data.localSite);
		var headers = {
			'host': url.host,
		};

		if (!req.headers['upgrade']) {
			headers['connection'] = 'close';
		}

		var buf = connect.createHTTPRequestHeader(req, headers);
		if (Buffer.isBuffer(head) && head.length) {
			buf = Buffer.concat([buf, head]);
		}
		return buf;
	}

	/**
	 * Destroys current session: closes all user sockets
	 * and pending requests. This session cannot be re-used
	 * when destroyed, you should create a new session;
	 */
	destroy() {
		this._destroyed = true;
		this._queueTimer.stop();
		this.data = this._queueTimer = null;
		
		var item;
		while (item = this.sockets.shift()) {
			item.destroy();
		}

		while (item = this._queue.shift()) {
			errorResponse(item[1], 'session-destroyed');
		}

		process.nextTick(function() {
			this.emit('destroy');
		});
	}
};

function onSocketTimeout() {
	debug('socket timeout');
	this.destroy();
}