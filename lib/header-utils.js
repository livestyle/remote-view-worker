/**
 * Utility methods for working with HTTP headers
 */
'use strict'

module.exports = {
	/**
	 * Returns resource MIME type from given response
	 * @param  {http.ServerResponse} res
	 * @return {String}
	 */
	mimeType(res) {
		return (res.getHeader('Content-Type') || '').split(';')[0].toLowerCase();
	},

	/**
	 * Returns Content-Length of given response stream
	 * @param  {http.ServerResponse} res
	 * @return {Number} Returns -1 if content length is not
	 * defined or invalid
	 */
	getLength(res) {
		var len = +res.getHeader('Content-Length');
		return isNaN(len) ? -1 : len;
	},

	/**
	 * Check if server response matches given mime type
	 * @param  {http.ServerResponse} res 
	 * @param  {String|Array} mime
	 * @return {Boolean}
	 */
	matchesMime(res, mime) {
		if (!mime) {
			return true;
		}

		if (!Array.isArray(mime)) {
			mime = [mime];
		}

		return mime.indexOf(module.exports.mimeType(res)) !== -1;
	}
};