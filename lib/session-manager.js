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

var dbCollection; // MongoDB collection, DB should be connected (@see #setup())
var sessionOptions = {
	// TODO write unit tests
	idleTimeout: 5 * 60 * 1000
};
var activeSessions = {};
var publicIdMap = LRU({
	max: 1000,
	maxAge: 60 * 60 * 1000
});

// create fulfilled promises in order to reduce object allocations 
// and memory footprint
var promisesCache = {};
var err = new Error('Connection to destination local server is closed');
err.code = 'ENOTUNNEL';
promisesCache.noTunnel = Promise.reject(err);
promisesCache.noPublicId = Promise.reject(new Error('No public ID'))

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
			sessionOptions = extend(sessionOptions, opt)
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
	}
};

/**
 * Returns session by its session ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @return {Promise}
 */
function getBySessionId(collection, sessionId) {
	if (!activeSessions[sessionId]) {
		activeSessions[sessionId] = queryBySessionId(collection, sessionId)
			.then(createSession);
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
		return promisesCache.noPublicId;
	}

	// There’s must be active tunnel already for given session/public id.
	// If not, simply bail out
	var sessionId = publicIdMap.get(publicId);
	if (!sessionId || !activeSessions[sessionId]) {
		// public ID is valid but there’s no connected tunnels for
		// given session
		debug('no tunnel for request');
		return promisesCache.noTunnel;
	}

	return activeSessions[sessionId];
}

function createSession(sessionData) {
	debug('create session object for %o', sessionData);
	var session = new Session(sessionData, sessionOptions);
	// manage session lifetime: when there’s no active tunnels for a period of
	// time, destroy session
	var timer = utils.timer(session.destroy.bind(session), sessionOptions.idleTimeout).start(true);
	
	publicIdMap.set(session.publicId, session.id);
	
	return session
	.on('open', timer.stop.bind(timer))
	.on('close', function() {
		if (!this.sockets.length) {
			debug('no more active tunnels, init session destroy sequence');
			timer.restart(true);
		}
	})
	.once('destroy', function() {
		console.log('destroying session');
	})
	.once('destroy', disposeSession);
}

function getPublicIdFromHost(host) {
	host = host || '';
	var parts = host.replace(/:\d+$/).split('.');
	// publicId is first subdomain (there’s might be more subdomains)
	return parts[parts.length - 3];
}

/**
 * Returns session from DB by it’s ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @return {Promise}
 */
function queryBySessionId(collection, sessionId) {
	return _querySession(collection, {_id: sessionId, active: true});
}

/**
 * Returns session from DB by it’s public ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @return {Promise}
 */
function queryByPublicId(collection, publicId) {
	return _querySession(collection, {active: true, publicId});
}

function _querySession(collection, query) {
	debug('find session by %o', query);
	return new Promise(function(resolve, reject) {
		collection.findOne(query, function(err, doc) {
			if (err) {
				debug('got error %s', err);
				e.code = 'EDBERROR';
				return reject(err);
			}

			if (!doc) {
				debug('no session found');
				let errSuffix = '';
				if ('_id' in query) {
					errSuffix = ' for ID ' + query._id;
				} else if ('publicId' in query) {
					errSuffix = ' for public ID ' + query.publicId;
				}
				err = new Error('No active session' + errSuffix);
				err.code = 'ENOSESSION';
				return reject(err);
			}

			debug('session found: %o', doc);
			resolve(doc);
		});
	});
}

function disposeSession() {
	delete activeSessions[this.id];
	publicIdMap.del(this.publicId);
	dbCollection.updateOne({_id: this.id}, {$set: {active: false}});
}