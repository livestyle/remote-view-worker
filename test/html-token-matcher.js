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

	it.only('performance', function() {
		var fs = require('fs');
		var path = require('path');
		var buf = fs.readFileSync(path.join(__dirname, 'test.html'));

		var start2 = Date.now();
		var _m2 = buf.toString('utf8').match(/<\/(head|body|html)>/i);
		var m2 = _m2.index;
		var end2 = Date.now();

		var m = htmlMatcher();
		var start = Date.now();
		var m1 = m.search(buf);
		var end = Date.now();

		

		console.log('First match: %d @ %dms', m1, end - start);
		console.log('Second match: %d @ %dms', m2, end2 - start2);
	});
});