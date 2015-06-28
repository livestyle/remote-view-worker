/**
 * Manages user sessions
 */
'use strict';

var assert = require('assert');
var LRU = require('lru-cache');
var debug = require('debug')('rv:manager');
var extend = require('xtend');
var Session = require('./session');
var utils = require('./utils');
var trafficCalc = require('./traffic-calculator');

var dbCollection; // MongoDB collection, DB should be connected (@see #setup())
var sessionOptions = {
	idleTimeout: 5 * 60 * 1000
};
var activeSessions = {};
var publicIdMap = {};
var failedSessionRequests = LRU({
	max: 10000,
	maxAge: 20000,
	dispose(key) {
		delete activeSessions[key];
	}
});
var parsedHostCache = LRU({
	max: 10000,
	maxAge: 30000
});

// cache common error as rejected promises to reduce memory allocations
// and footprint
var errorCache = {};
var defaultErrors = {
	'ENOTUNNEL': 'Connection to destination local server is closed',
	'ENOPUBLICID': 'No public ID'
};

module.exports = {
	/**
	 * Returns session for given request
	 * @param  {http.IncomingMessage} req
	 * @return {Session}
	 */
	getSession(req) {
		assert(dbCollection);

		if (typeof req === 'object' && req.headers) {
			// it’s a HTTP request, we are looking for session by public ID
			let host = req.headers['x-rv-host'] || req.headers.host
			debug('get session for request to %s', host);
			return getByPublicId(dbCollection, getPublicIdFromHost(host));
		}

		// otherwise, assume we are searching for session by its ID
		debug('get session for id %s', req);
		return getBySessionId(dbCollection, req);
	},
	setup(db, opt) {
		assert(db);
		dbCollection = db.collection('Session');
		if (typeof opt === 'object') {
			sessionOptions = extend(sessionOptions, opt);
			if (opt.trafficStoreTimeout) {
				setInterval(function() {
					trafficCalc.store(dbCollection);
				}, opt.trafficStoreTimeout).unref();
			}
		}
	},
	reset() {
		var _destroy = function(session) {
			session.destroy();
		};

		Object.keys(activeSessions).forEach(function(key) {
			activeSessions[key].then(_destroy);
			delete activeSessions[key];
		});
	},
	activeSessions() {
		return Object.keys(activeSessions);
	}
};

/**
 * Returns session by its session ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @return {Promise}
 */
function getBySessionId(collection, sessionId) {
	// touch failedSessionRequests to clean obsolete items
	failedSessionRequests.get(sessionId);
	if (!activeSessions[sessionId]) {
		activeSessions[sessionId] = queryBySessionId(collection, sessionId)
			.then(createSession);
	} else {
		debug('use cached response for session %s', sessionId);
	}

	return activeSessions[sessionId];
}

/**
 * Returns session by its public ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @return {Promise}
 */
function getByPublicId(collection, publicId) {
	if (!publicId) {
		debug('reject by public id');
		return getError('ENOPUBLICID');
	}

	// There’s must be active tunnel already for given session/public id.
	// If not, simply bail out
	var sessionId = publicIdMap[publicId];
	if (!sessionId || !activeSessions[sessionId]) {
		// public ID is valid but there’s no connected tunnels for
		// given session
		delete publicIdMap[publicId];
		debug('no tunnel for request');
		return getError('ENOTUNNEL');
	}

	return activeSessions[sessionId];
}

function createSession(sessionData) {
	debug('create session object for %o', sessionData);
	var session = new Session(sessionData, sessionOptions);
	// manage session lifetime: when there’s no active tunnels for a period of
	// time, destroy session
	var timer = utils.timer(session.destroy.bind(session), sessionOptions.idleTimeout).start(true);
	
	publicIdMap[session.publicId] = session.id;
	
	return session
	.on('open', timer.stop.bind(timer))
	.on('close', function() {
		if (!this.sockets.length) {
			debug('no more active tunnels, init session destroy sequence');
			timer.restart(true);
		}
	})
	.once('destroy', disposeSession);
}

function getPublicIdFromHost(host) {
	host = host || '';

	var parsed = parsedHostCache.get(host);
	if (parsed) {
		return parsed;
	}

	var parts = host.replace(/:\d+$/).split('.');
	// publicId is first subdomain (there’s might be more subdomains)
	parsed = parts[parts.length - 3];
	parsedHostCache.set(host, parsed);
	return parsed;
}

/**
 * Returns session from DB by it’s ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @return {Promise}
 */
function queryBySessionId(collection, sessionId) {
	debug('find session in DB by id');
	return new Promise(function(resolve, reject) {
		collection.findOne({_id: sessionId, active: true}, function(err, doc) {
			if (err) {
				debug('got error %s', err);
				e.code = 'EDBERROR';
				return reject(err);
			}

			if (!doc) {
				debug('no session found');
				err = new Error('No active session for ID ' + sessionId);
				err.code = 'ENOSESSION';
				failedSessionRequests.set(sessionId, true);
				return reject(err);
			}

			debug('session found: %o', doc);
			resolve(doc);
		});
	});
}

function disposeSession() {
	delete activeSessions[this.id];
	delete publicIdMap[this.publicId];
	dbCollection.updateOne({_id: this.id}, {$set: {active: false}});
}

function getError(code) {
	if (!(code in errorCache)) {
		var err = new Error(defaultErrors[code] || code);
		err.code = code;
		errorCache[code] = Promise.reject(err);
	}

	return errorCache[code];
}