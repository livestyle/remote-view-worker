/**
 * Manages user sessions
 */
'use strict';

var Session = require('./session');

var sessionOptions = {};
var _sessionMock;

module.exports = {
	/**
	 * Returns session for given request
	 * @param  {http.IncomingMessage} req
	 * @return {Session}
	 */
	getSession(req) {
		// return mock during testing
		if (!_sessionMock) {
			_sessionMock = new Session({
				"userId": "123",
				"sessionId": "66c123c7",
				"remoteSiteId": "super-duper",
				"localSite": "http://emmet.io",
				"connectUrl": "http://localhost:9001/66c123c7",
				"expiresAt": 1430258415646
			}, sessionOptions);
		}
		return _sessionMock;
	},
	setSessionOptions(opt) {
		sessionOptions = opt || {};
	}
};