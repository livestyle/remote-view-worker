/**
 * Returns session object for given request.
 * Session object controls access to user resources
 * and manages socket connections
 */
'use strict'

var urlUtils = require('url');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('rv-worker');
var through = require('through2');
var errorResponse = require('./error-response');
var transformStream = require('./transform-stream');
var inject = require('./html-inject');
var compress = require('./compress');
var utils = require('./utils');

const MAX_QUEUE = 100;
const SOCKET_WAIT_TIMEOUT = 5000;
const REQUEST_TIMEOUT = 10000; // ms

module.exports = class Session extends EventEmitter {
	constructor(data) {
		super();
		this.data = data;
		this.sockets = [];
		this._destroyed = false;
		this._queue = [];
		this._queueTimer = utils.timer(function() {
			debug('freeing queued %d connections', this._queue.length);
			var queueItem;
			while (queueItem = this._queue.shift()) {
				errorResponse(queueItem[1], 'no-free-socket');
			}
		}.bind(this), SOCKET_WAIT_TIMEOUT);
	}

	addSocket(socket) {
		if (!this._destroyed && this.data.maxConnections > this.sockets.length) {
			debug('socket connected for session %s', this.data.socketId);
			var self = this;

			var onTimeout = function() {
				debug('socket timeout');
				socket.destroy();
			};

			socket.setTimeout(REQUEST_TIMEOUT, onTimeout);
			socket.once('close', function() {
				debug('socket removed for session %s', self.data.socketId);
				utils.removeFromArray(self.sockets, socket);
				socket.removeListener('timeout', onTimeout);
			});

			this.sockets.push(socket);
			this.emit('socket', socket);

			if (this._queue.length) {
				debug('redirect queued connection');
				this.redirect.apply(this, this._queue.shift());
			}
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
		if (!this.sockets.length) {
			// no available socket, add request to queue
			// until next free socket will be available
			return this.addToQueue(req, res, head);
		}

		var url = urlUtils.parse(this.data.localSite);
		debug('bouncing to %s', url.host);

		var header = transformStream.createHTTPRequestHeader(req, {
			'host': url.host,
			'x-forwarded-proto': url.protocol.replace(/:.*$/, '')
		});

		var socket = this.sockets.shift();
		socket.write(new Buffer(header));
		if (Buffer.isBuffer(head) && head.length) {
			socket.write(head);
		}

		if (req.headers['upgrade']) {
			// a WebSocket connection, use different strategy
			socket.pipe(res).pipe(socket);
		} else {
			// regular HTTP connection
			req
			.pipe(socket, {end: false})
			.pipe(transformStream(req, res))
			.pipe(inject(req, res, '<!-- RV injected -->'))
			.pipe(compress(req, res))
			.pipe(res);
		}
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
	addToQueue(socket) {
		debug('add connection to queue');
		if (this._destroyed) {
			return errorResponse(res, 'session-destroyed');
		}

		if (this._queue.length >= MAX_QUEUE) {
			return errorResponse(res, 'too-many-requests');
		}

		this._queue.push(utils.toArray(arguments));
		this._queueTimer.restart();
	}

	/**
	 * Destroys current session: closes all user sockets
	 * and pending requests. This session cannot be re-used
	 * when destroyed, you should create a new session;
	 */
	destroy() {
		this.emit('destroy');
		this._queueTimer.stop();
		this.data = this._queueTimer = null;
		
		var item;
		while (item = this.sockets.shift()) {
			item.destroy();
		}

		while (item = this._queue.shift()) {
			errorResponse(item[1], 'session-destroyed');
		}
	}
};