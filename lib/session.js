'use strict';

var EventEmitter = require('events');
var parseUrl = require('url').parse;
var extend = require('xtend');
var debug = require('debug')('rv:session');
var errorResponse = require('./error-response');
var utils = require('./utils');
var trafficCalc = require('./traffic-calculator');

// transformations
var connect = require('./transforms/connect');
var inject = require('./transforms/inject');
var gzip = require('./transforms/gzip');

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
	requestTimeout: 60000,

	// time (ms) to keep Websocket connection alive when no data 
	// is transmitted
	websocketRequestTimeout: 600000,

	// Code to inject into HTML page. May contain %token% entries that refer to
	// session data or options
	injectCode: '<script src="http://download.emmet.io/livestyle-rv.js" data-livestyle-connect="ws://%publicId%/__livestyle__/"></script>'
};

module.exports = class Session extends EventEmitter {
	constructor(data, options) {
		super();
		this.data = extend(data);
		this.sockets = [];
		this.options = extend({}, defaultOptions, options || {});
		this._destroyed = false;
		this._deactivated = false;
		this._queue = [];
		this._socketId = 0;
		this._localHost = parseUrl(data.localSite).host;
		this._liveStyleChannel = null;
		this._liveStyleClients = [];

		this._id = this.data._id || this.data.sessionId;
		this._publicId = this.data.publicId;

		if (this.options.injectCode) {
			let code = utils.template(this.options.injectCode, extend(this.options, this.data));
			this._injectCode = new Buffer(code);
		}

		this.on('socket', this._nextInQueue);

		var self = this;
		this._queueTimer = utils.timer(function() {
			debug('freeing queued %d connections', self._queue.length);
			var queueItem;
			while (queueItem = self._queue.shift()) {
				errorResponse(queueItem[1], 'no-free-socket');
			}
		}, this.options.socketWaitTimeout);

		this.trafficCalc = trafficCalc(this.id, this.data.trafficLimit || this.options.trafficLimit);
		this.trafficCalc.once('limit', function() {
			let item;
			while (item = self._queue.shift()) {
				errorResponse(item[1], 'quota-exceeded');
			}
			self.destroy();
		});

		this._onSocketClose = function() {
			debug('close socket %d in session %s', this._rvid, this.sessionId);
			utils.removeFromArray(self.sockets, this);
			this.removeListener('timeout', onSocketTimeout);
			this.removeListener('end', onSocketEnd);
			this.destroy();
			self.emit('close', this);
		};

		this.disposeQueued = utils.debounce(function() {
			var prev = self._queue.length;
			self._queue = self._queue.filter(function(item) {
				return item[1].connection && item[1].connection.writable;
			});
		}, 100);
	}

	get id() {
		return this._id;
	}

	get publicId() {
		return this._publicId;
	}

	get injectCode() {
		return this._injectCode;
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
		
		socket._rvid = ++this._socketId;
		socket.sessionId = this.id;

		debug('add socket %d for session %s', socket._rvid, this.id);

		socket
		.once('end', onSocketEnd)
		.once('close', this._onSocketClose)
		.setTimeout(socket.websocket ? this.options.websocketRequestTimeout : this.options.requestTimeout, onSocketTimeout);
		
		this.sockets.push(socket);
		this.emit('open', socket);
		emitSocketEvent(this, socket);
	}

	/**
	 * Sets dedicated LiveStyle tunnel
	 * @param {WebSocketConection} socket
	 */
	set liveStyleChannel(connection) {
		if (this._liveStyleChannel) {
			this._liveStyleChannel.drop();
		}

		var self = this;
		var onData = onLiveStyleMessage.bind(this);

		this._liveStyleChannel = connection
		.on('message', onData)
		.once('close', function() {
			if (this.connected) {
				this.drop();
			}
			this.removeListener('message', onData);
			if (self._liveStyleChannel === this) {
				self._liveStyleChannel = null;
			}
			connection = null;
		});
	}

	get liveStyleChannel() {
		return this._liveStyleChannel;
	}

	addLiveStyleClient(client) {
		if (this._liveStyleClients.indexOf(client) === -1) {
			var self = this;
			client.once('close', function() {
				utils.removeFromArray(self._liveStyleClients, client);
				client = null;
			});

			this._liveStyleClients.push(client);
		}
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

	_redirect(socket, req, res, head) {
		socket.write(headersPayload(req, this._localHost));

		if (req.headers['upgrade']) {
			// a WebSocket connection, use different strategy
			debug('piping websocket');
			socket.pipe(res).pipe(socket);
		} else {
			debug('piping redirect, req state: %s, socket state: %s', req.connection.readyState, socket.readyState);
			// server traffic spent as follows:
			// user -> rv server -> tunnel -> rv server -> user
			// so we have to insert multiple calculators
			req
			.pipe(this.trafficCalc.calculate(2)) // user -> rv server -> tunnel
			.pipe(socket, {end: false})
			.pipe(this.trafficCalc.calculate())  // tunnel -> rv server
			.pipe(connect(res))
			.pipe(inject(this, req, res))
			.pipe(gzip(req, res))
			.pipe(this.trafficCalc.calculate())  // rv server -> user
			.pipe(res);
		}
	}

	/**
	 * Returns first socket ready for tunneling
	 * @return {net.Socket}
	 */
	availableSocket() {
		return this.sockets.shift();
	}

	/**
	 * Queues incoming HTTP request for tunneled web-site until first free 
	 * tunnel is available. If no free tunnel is available during some period 
	 * of time, connection is closed with error
	 * @param  {ClientRequest} req
	 * @param  {ServerResponse} res
	 */
	addToQueue(req, res, head) {
		debug('add connection to queue');
		if (this._destroyed) {
			return errorResponse(res, 'session-destroyed');
		}

		if (this._queue.length >= this.options.maxQueue) {
			return errorResponse(res, 'too-many-requests');
		}

		debug('add to queue, %d of %d', this._queue.length + 1, this.options.maxQueue);
		this._queue.push([req, res, head]);
		res.connection.once('close', this.disposeQueued);
		this._queueTimer.restart();
	}

	_nextInQueue() {
		if (this._queue.length) {
			debug('redirect queued connection');
			var item = this._queue.shift();
			item[1].connection.removeListener('close', this.disposeQueued);
			this.redirect.apply(this, item);
		}
	}

	/**
	 * Generates LiveStyle client HTML code
	 * @return {Buffer}
	 */
	clientCode() {
		return new Buffer('<!-- RV injected -->');
	}

	get deactivated() {
		return this._deactivated;
	}

	/**
	 * Completely deactivates session (out of traffic limit, session expired etc.).
	 * Current implementation simply destroys session and emits 'deactivate'
	 * event which must be handled by session manager and update DB accordingly
	 */
	deactivate() {
		if (!this._deactivated) {
			this._deactivated = true;
			this.emit('deactivate');
			this.destroy();
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
		debug('destroying session');
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

		if (this.liveStyleChannel) {
			this.liveStyleChannel.drop();
		}

		while (this._liveStyleClients.length) {
			this._liveStyleClients.pop().drop(1000);
		}

		if (this.trafficCalc) {
			this.trafficCalc.destroy();
			this.trafficCalc = null;
		}
		emitDestroy(this);
	}
}

function onSocketTimeout() {
	debug('socket %d timeout', this._rvid);
	this.end();
	this.destroy();
}

function onSocketEnd() {
	// in case if remote part sends FIN packet,
	// explicitly close socket
	debug('end socket %d in session %s', this._rvid, this.sessionId);
	this.destroy();
}

function onLiveStyleMessage(message) {
	if (!message || message.type !== 'utf8') {
		return;
	}

	// re-transmit data frame to all connected clients
	for (var i = 0, il = this._liveStyleClients.length; i < il; i++) {
		this._liveStyleClients[i].send(message.utf8Data);
	}
}

function emitSocketEvent(session, socket) {
	process.nextTick(function() {
		session.emit('socket', socket);
		socket = null;
	});
}

function emitDestroy(session) {
	process.nextTick(function() {
		debug('session destroyed');
		session.emit('destroy');
		session = null;
	});
}

function headersPayload(req, host) {
	var headers = extend(req.headers);

	headers.host = host;
	if (!req.headers.upgrade) {
		headers.connection = 'close';
	}

	var payload = [`${req.method} ${req.url} HTTP/1.1`];
	let headerNames = Object.keys(headers);
	for (let i = 0, il = headerNames.length; i < il; i++) {
		let header = headerNames[i];
		payload.push(`${header}: ${headers[header]}`);
	}
	payload.push('\r\n');
	return payload.join('\r\n');
}