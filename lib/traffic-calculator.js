/**
 * Class for traffic calculation for given session
 */
'use strict';
var stream = require('stream');
var EventEmitter = require('events');
var debug = require('debug')('rv:traffic');
var utils = require('./utils');

/**
 * All calculator instances. The reason to keep all instances in array
 * is to allow external manager to store session traffic even after session was
 * destroyed
 */
var instances = [];

module.exports = function(sessionId, limit) {
	return new TrafficCalculator(sessionId, limit);
};

/**
 * Stores current traffic stats in given collection
 * @param  {MongoCollection}   collection
 * @param  {Function} callback
 */
module.exports.store = function(collection, callback) {
	var lookup = new Map();
	var payload = instances.filter(function(item) {
		return item.traffic !== item._storedTraffic;
	}).map(function(item) {
		lookup.set(item.sessionId, item);
		return {
			_id: item.sessionId,
			delta: item.traffic - item._storedTraffic
		};
	});

	removeDestroyed();

	if (!payload.length) {
		// no updated sessions
		return callback && callback();
	}

	collection.bulkWrite(payload.map(function(item) {
		return {
			updateOne: {
				filter: {_id: item._id},
				update: {
					$inc: {traffic: item.delta}
				}
			}
		};
	}), function(err) {
		// write down stored traffic stats
		payload.forEach(function(item) {
			var calc = lookup.get(item._id);
			if (calc) {
				calc._storedTraffic += item.delta;
			}
		});
		lookup.clear();
		callback && callback(err);
	});
};

function removeDestroyed() {
	instances = instances.filter(function(item) {
		return !item._destroyed;
	});
}

class TrafficCalculator extends EventEmitter {
	constructor(sessionId, limit) {
		super();
		this.sessionId = sessionId;
		this.traffic = 0;
		this.limit = typeof limit === 'undefined' ? Number.POSITIVE_INFINITY : +limit;
		
		this._storedTraffic = 0;
		this._limitExceeded = false;
		this._destroyed = false;

		var self = this;
		this._calc = function(bytesLen) {
			self.traffic += bytesLen;
			debug('saving %d (%d)', bytesLen, self.traffic);
			if (self.traffic > self.limit && !self._limitExceeded) {
				self._limitExceeded = true;
				self.emit('limit');
			}
		};
		instances.push(this);
	}

	/**
	 * Returns stream for traffic calculation for given session
	 * @param  {Number} factor Traffic multiplier
	 * @return {stream}
	 */
	calculate(factor, options) {
		return new TrafficStream(this._calc, factor, options);
	}

	/**
	 * Marks current calculator as destroyed: on next traffic stats flushing
	 * it will be removed from global instances list
	 */
	destroy() {
		this._destroyed = true;
		this.emit('destroy');
	}
};

class TrafficStream extends stream.Transform {
	constructor(fn, factor, options) {
		if (typeof factor === 'object') {
			options = factor;
			factor = 1;
		}
		super(options);
		this.fn = fn;
		this.factor = factor || 1;
	}

	_transform(chunk, enc, next) {
		this.fn(chunk.length * this.factor);
		next(null, chunk);
	}

	_flush(next) {
		this.fn = null;
		next();
	}
};