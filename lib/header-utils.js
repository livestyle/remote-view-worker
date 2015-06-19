/**
 * Utility methods for working with HTTP headers
 */
'use strict';

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
	},

	/**
	 * Check if given HTTP header value contains supported content encoding
	 * @param  {String} value
	 * @return {String} First supported encoding name from value
	 */
	supportedEncoding(value) {
		if (!value) {
			return;
		}

		var parts = value.split(',').map(_normalize);
		if (parts.indexOf('gzip') !== -1) {
			return 'gzip';
		}

		if (parts.indexOf('deflate') !== -1) {
			return 'deflate';
		}
	}
};

function _normalize(name) {
	return name.trim().toLowerCase();
}