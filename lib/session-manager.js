/**
 * Manages user sessions
 */
'use strict'

var Session = require('./session');

var _sessionMock = new Session({
	"userId": "123",
	"sessionId": "66c123c7",
	"remoteSiteId": "super-duper",
	"localSite": "http://emmet.io",
	"expiresAt": 1430258415646,
	"maxConnections": 6,
	"worker": "10.0.1.2"
});

module.exports = {
	/**
	 * Returns session for given request
	 * @param  {http.IncomingMessage} req
	 * @return {Session}
	 */
	getSession(req) {
		// return mock during testing
		return _sessionMock;
	}
};