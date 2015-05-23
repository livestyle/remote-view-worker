'use strict';

var EventEmitter = require('events');
var parseUrl = require('url').parse;
var extend = require('xtend');
var debug = require('debug')('rv:session');
var errorResponse = require('./error-response');
var utils = require('./utils');

// transformations
var connect = require('./connect');
var inject = require('./inject');
var compress = require('./compress');

var defaultOptions = {
	// max amount of tunnels for session
	maxTunnels: 10,

	// max amount of pending HTTP requests for tunneling
	maxQueue: 500,

	// how much time (ms) to wait until next free tunnel socket
	// will be available (e.g. time to keep pending HTTP in queue)
	socketWaitTimeout: 30000,

	// time (ms) to keep socket connection alive when no data 
	// is transmitted
	requestTimeout: 60000
};

module.exports = class Session extends EventEmitter {
	constructor(data, options) {
		super();
		this.data = data;
		this.sockets = [];
		this.options = extend({}, defaultOptions, options || {});
		this._destroyed = false;
		this._queue = [];
		this._socketId = 0;

		this.on('socket', this._nextInQueue);

		var self = this;
		this._queueTimer = utils.timer(function() {
			debug('freeing queued %d connections', self._queue.length);
			var queueItem;
			while (queueItem = self._queue.shift()) {
				errorResponse(queueItem[1], 'no-free-socket');
			}
		}, this.options.socketWaitTimeout);
	}

	addSocket(socket) {
		if (this.sockets.indexOf(socket) !== -1) {
			return debug('socket is already in pool');
		}

		if (this.destroyed) {
			debug('unable to add socket to destroyed session')
			return socket.destroy();
		}

		if (this.sockets.length >= this.options.maxTunnels) {
			debug('too many open sockets: %d + 1', this.sockets.length);
			return socket.destroy();
		}

		
		var self = this;
		socket._rvid = ++this._socketId;

		debug('add socket %d for session %s', socket._rvid, this.data.sessionId);

		socket.once('end', function() {
			// in case if remote part sends FIN packet,
			// explicitly close socket
			debug('end socket %d in session %s', this._rvid, self.data.sessionId);
			this.destroy();
		})
		.once('close', function() {
			debug('close socket %d in session %s', this._rvid, self.data.sessionId);
			utils.removeFromArray(self.sockets, this);
			this.removeListener('timeout', onSocketTimeout);
			this.destroy();
			self.emit('close', this);
		})
		.setTimeout(this.options.requestTimeout, onSocketTimeout);
		
		this.sockets.push(socket);
		process.nextTick(function() {
			self.emit('socket', socket);
		});
	}

	/**
	 * Redirects HTTP request to one of the available tunnels sockets. 
	 * If no free socket, request is queued until new socket is opened. If no 
	 * free socket is available for queued request during timeout, 
	 * the connection is closed with error
	 * @param {http.IncomingMessage} req
	 * @param {http.ServerResponse} res
	 */
	redirect(req, res, head) {
		var destSocket = res.connection || res;
		if (!destSocket.writable) {
			// destination socket is not writable,
			// which means requesting client closed connection and we
			// don’t have to make a request
			debug('receiving socket closed for request %s%s, no redirect', req.headers.host, req.url);
			destSocket.destroy();
			return this._nextInQueue();
		}

		var socket = this.availableSocket();
		if (!socket) {
			// no available socket, add request to queue
			// until next free socket will be available
			return this.addToQueue(req, res, head);
		}

		debug('redirecting request %s%s to socket %d', req.headers.host, req.url, socket._rvid);
		this._redirect(socket, req, res, head);
	}

	/**
	 * Returns first socket ready for tunneling
	 * @return {net.Socket}
	 */
	availableSocket() {
		return this.sockets.shift();
	}

	/**
	 * Queues incoming HTTP connection to use local web-site until first free 
	 * socket is available. If no free socket is available during some period 
	 * of time, connection is closed with error
	 * @param  {ClientRequest} req
	 * @param  {ServerResponse} res
	 */
	addToQueue(req, res) {
		debug('add connection to queue');
		if (this._destroyed) {
			return errorResponse(res, 'session-destroyed');
		}

		if (this._queue.length >= this.options.maxQueue) {
			return errorResponse(res, 'too-many-requests');
		}

		debug('add to queue, %d of %d', this._queue.length + 1, this.options.maxQueue);
		this._queue.push(utils.toArray(arguments));
		this._queueTimer.restart();
	}

	_redirect(socket, req, res, head) {
		var headers = extend(req.headers, {
			host: parseUrl(this.data.localSite).host
		});

		if (!req.headers['upgrade']) {
			headers['connection'] = 'close';
		}

		var payload = [`${req.method} ${req.url} HTTP/1.1`];
		Object.keys(headers).forEach(function(header) {
			payload.push(`${header}: ${headers[header]}`);
		});
		payload.push('\r\n');

		socket.write(payload.join('\r\n'));

		if (req.headers['upgrade']) {
			// a WebSocket connection, use different strategy
			debug('piping websocket');
			socket.pipe(res).pipe(socket);
		} else {
			debug('piping redirect, req state: %s, socket state: %s', req.connection.readyState, socket.readyState);
			// req.pipe(socket, {end: false}).pipe(res.connection);
			// actual tunneling pipeline:
			req
			.pipe(socket, {end: false})
			.pipe(connect(req, res))
			.pipe(inject(this, req, res))
			.pipe(compress(req, res))
			.pipe(res);
		}
	}

	_nextInQueue() {
		if (this._queue.length) {
			debug('redirect queued connection');
			this.redirect.apply(this, this._queue.shift());
		}
	}

	get destroyed() {
		return this._destroyed;
	}

	/**
	 * Destroys current session: closes all user sockets and pending requests. 
	 * This session cannot be re-used when destroyed, you should create 
	 * a new session
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

		var self = this;
		process.nextTick(function() {
			self.emit('destroy');
		});
	}
}

function onSocketTimeout() {
	debug('socket %d timeout', this._rvid);
	this.end();
	this.destroy();
}