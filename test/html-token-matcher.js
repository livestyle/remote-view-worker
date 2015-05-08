var assert = require('assert');
var htmlMatcher = require('../lib/html-token-matcher');

describe('HTML Token Matcher', function() {
	it('basic matching', function() {
		var m = htmlMatcher();
		assert.equal(m.search('<body>hello </body> world'), 12);
		assert.equal(m.offset, 12);

		m.reset();
		assert.equal(m.search('</head>hello'), 0);
		assert.equal(m.offset, 0);

		m.reset();
		assert.equal(m.search('hello'), -1);

		m.reset();
		assert.equal(m.search('<!-- </head> --> </body>'), 17);
	});
});