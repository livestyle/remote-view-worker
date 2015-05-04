module.exports = {
	toArray: function(obj, ix) {
		return Array.prototype.slice.call(obj, ix || 0);
	},
	removeFromArray: function(arr, item) {
		var ix = arr.indexOf(item);
		if (ix !== -1) {
			arr.splice(ix, 1);
		}
		return arr;
	},

	timer: function(fn, delay) {
		var timerId;
		var start = function() {
			if (!timerId) {
				timerId = setTimeout(fn, delay || 1);
			}
		};

		var stop = function() {
			if (timerId) {
				clearTimeout(timerId);
				timerId = null;
			}
		};

		return {
			start: start,
			stop: stop,
			restart: function() {
				stop();
				start();
			}
		}
	},

	/**
	 * Returns a function, that, as long as it continues to be invoked, will not
	 * be triggered. The function will be called after it stops being called for
	 * N milliseconds. If `immediate` is passed, trigger the function on the
	 * leading edge, instead of the trailing.
	 */
	debounce: function(func, wait, immediate) {
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