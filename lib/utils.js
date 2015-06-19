'use strict';

module.exports = {
	toArray(obj, ix) {
		return Array.prototype.slice.call(obj, ix || 0);
	},

	removeFromArray(arr, item) {
		var ix = arr.indexOf(item);
		if (ix !== -1) {
			arr.splice(ix, 1);
		}
		return arr;
	},

	timer(fn, delay) {
		return new ResumableTimer(fn, delay);
	},

	/**
	 * Returns a function, that, as long as it continues to be invoked, will not
	 * be triggered. The function will be called after it stops being called for
	 * N milliseconds. If `immediate` is passed, trigger the function on the
	 * leading edge, instead of the trailing.
	 */
	debounce(func, wait, immediate) {
		var timeout, args, context, timestamp, result;

		var later = function() {
			var last = Date.now() - timestamp;

			if (last < wait && last >= 0) {
				timeout = setTimeout(later, wait - last);
			} else {
				timeout = null;
				if (!immediate) {
					result = func.apply(context, args);
					if (!timeout) {
						context = args = null;
					}
				}
			}
		};

		return function() {
			context = this;
			args = arguments;
			timestamp = Date.now();
			var callNow = immediate && !timeout;
			if (!timeout) {
				timeout = setTimeout(later, wait);
			}

			if (callNow) {
				result = func.apply(context, args);
				context = args = null;
			}

			return result;
		};
	}
};

class ResumableTimer {
	constructor(fn, delay) {
		this.fn = fn;
		this.delay = delay;
		this._timerId = null;
	}

	start(unref) {
		if (!this._timerId) {
			this._timerId = setTimeout(this.fn, this.delay || 1);
			if (unref) {
				this._timerId.unref();
			}
		}
		return this;
	}

	stop() {
		if (this._timerId) {
			clearTimeout(this._timerId);
			this._timerId = null;
		}
		return this;
	}

	restart(unref) {
		return this.stop().start(unref);
	}
};