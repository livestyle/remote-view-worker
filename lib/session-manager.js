/**
 * Manages user sessions
 */
'use strict';

var assert = require('assert');
var LRU = require('lru-cache');
var Session = require('./session');

var dbCollection; // MongoDB collection, DB should be connected
var sessionOptions = {};
var sessionCache = LRU({
	max: 1000,
	maxAge: 60 * 60 * 1000,
	dispose: function(key, session) {
		session.destroy();
	}
});

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
			let parts = (req.headers.host || '').replace(/:\d+$/).split('.');
			// publicId is first subdomain (we might have more subdomains)
			let publicId = parts[parts.length - 3];
			return getByPublicId(dbCollection, publicId, sessionCache);
		}

		// otherwise, assume we are searching for session by its ID
		return getBySessionId();
	},
	setup(db, opt) {
		assert(db);
		dbCollection = db.collection('Session');
		sessionOptions = opt || {};
	}
};

/**
 * Returns session by its session ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @param  {LRU} cache
 * @return {Promise}
 */
function getBySessionId(collection, sessionId, cache) {
	if (cache) {
		// try to search in cache
		var key = keyForRegexp(storage, new RegExp(`^${sessionId}::`));
		var item = storage.get(key);
		if (item) {
			return Promise.resolve(item);
		}
	}

	return queryBySessionId(collection, sessionId)
	.then(function(sessionData) {
		return createSession(sessionData, cache);
	});
}

/**
 * Returns session by its public ID
 * @param  {MongoCollection} collection
 * @param  {String} sessionId
 * @param  {LRU} cache
 * @return {Promise}
 */
function getByPublicId(storage, publicId, cache) {
	if (cache) {
		// try to search in cache
		var key = keyForRegexp(storage, new RegExp(`::${publicId.replace(/\-/g, '\\-')}$`));
		var item = storage.get(key);
		if (item) {
			return Promise.resolve(item);
		}
	}

	return queryByPublicId(collection, publicId)
	.then(function(sessionData) {
		return createSession(sessionData, cache);
	});
}

function createSession(sessionData, cache) {
	var session = new Session(sessionData, sessionOptions);
	if (cache) {
		cache.set(createCacheKey(session), session);
	}
	return session;
}

/**
 * Creates compound cache key for session
 * @param  {Session} session
 * @return {String}
 */
function createCacheKey(session) {
	return session.data._id + '::' + session.publicId;
}

/**
 * Returns key from cache storage that matches given regexp
 * @param  {LRU} storage
 * @param  {RegExp} regexp
 * @return {String}
 */
function keyForRegexp(storage, regexp) {
	var key = null;
	storage.keys().some(function(k) {
		if (regexp.test(k)) {
			return key = k;
		}
	});
	return key;
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
	return new Promise(function(resolve, reject) {
		collection.findOne(query, function(err, doc) {
			if (err) {
				e.code = 'EDBERROR';
				return reject(err);
			}

			if (!doc) {
				err = new Error('No active session for id ' + sessionId);
				err.code = 'ENOSESSION';
				return reject(err);
			}

			resolve(doc);
		});
	});
}