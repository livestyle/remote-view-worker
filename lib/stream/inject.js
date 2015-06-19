'use strict';

var stream = require('stream');

var trf = {transform(chunk, enc, next) {
	return next(null, chunk, enc);
}};

module.exports = function(injection, options) {
	return new InjectWrapper(injection, options);
};

class InjectWrapper extends stream.Duplex {
	constructor(injection, options) {
		if (typeof injection !== 'function') {
			options = injection;
			injection = null;
		}

		options = options || {};
		options.objectMode = true;

		super(options);
		this._injection = injection;

		var readable = this._readable = new stream.Transform(trf);
		var writable = this._writable = new stream.Transform(trf);
		writable.pipe(readable);

		this._bubbleErrors = (typeof options.bubbleErrors === "undefined") || !!options.bubbleErrors;

		var self = this;
		var emitError = function(err) {
			self.emit('error', err);
		};

		writable.once('finish', function() {
			self.end();
		});

		this.once('finish', function() {
			writable.end();
			writable.removeListener('error', emitError);
			readable.removeListener('error', emitError);
		});

		readable.on('data', function(e) {
			if (!self.push(e)) {
				this.pause();
			}
		});

		readable.once('end', function() {
			return self.push(null);
		});

		if (this._bubbleErrors) {
			writable.on("error", emitError);
			readable.on("error", emitError);
		}
	}

	inject() {
		this._writable.unpipe(this._readable);
		var stream = this._writable;
		for (var i = 0, il = arguments.length; i < il; i++) {
			if (arguments[i]) {
				stream = stream.pipe(arguments[i]);
			}
		}
		stream.pipe(this._readable);
	}

	_write(input, encoding, done) {
		if (typeof this._injection === 'function') {
			this._injection();
			this._injection = null;
		}
		this._writable.write(input, encoding, done);
	}

	_read(n) {
		this._readable.resume();
	}
};

module.exports.InjectWrapper = InjectWrapper;