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

	it('feed match', function() {
		var m = htmlMatcher();
		assert.equal(m.search('hello </bo'), -1);
		assert.equal(m.offset, 6);
		assert.equal(m.search('hello </bod'), -1);
		assert.equal(m.offset, 6);
		assert.equal(m.search('hello </body'), -1);
		assert.equal(m.offset, 6);
		assert.equal(m.search('hello </body> test'), 6);

		m.reset();
		assert.equal(m.search('a <!'), -1);
		assert.equal(m.offset, 2);
		assert.equal(m.search('a <!--'), -1);
		assert.equal(m.offset, 6);
		assert.equal(m.search('a <!-- </head>'), -1);
		assert.equal(m.offset, 14);
		assert.equal(m.search('a <!-- </head> --'), -1);
		assert.equal(m.offset, 15);
		assert.equal(m.search('a <!-- </head> --> </head>'), 19);

		// test optimistic offset
		m.reset();
		assert.equal(m.search('<!'), -1);
		assert.equal(m.offset, 0);
		assert.equal(m.search('<!-- foo -'), -1);
		assert.equal(m.offset, 9);
		assert.equal(m.search('<!-- foo - bar -'), -1);
		assert.equal(m.offset, 9);
		assert.equal(m.search('<!-- foo - bar --></head>'), 18);
	});

	it('feed-shift match', function() {
		var m = htmlMatcher();
		var input = new Buffer('');
		var output = [];
		var pos = 0;

		var push = function(chunk) {
			input = Buffer.concat([input, new Buffer(chunk)]);
		};
		var shift = function() {
			var chunk = m.shift(input);
			if (!chunk.length) {
				return;
			}
			pos += chunk.length;
			output.push(chunk);
			if (chunk === input) {
				input = new Buffer('');
			} else {
				input = input.slice(chunk.length);
			}
		};

		var feed = function(chunk) {
			push(chunk);
			var res = m.search(input);
			shift();
			return res;
		};

		assert.equal(feed('foo'), -1);
		assert.equal(feed('<!'), -1);
		assert.equal(feed('-- bar'), -1);
		assert.equal(feed('-->'), -1);
		assert.equal(feed('</a'), -1);
		assert.equal(feed('></he'), -1);
		assert.equal(feed('ad>'), 0);

		output.push(input);

		output = output.map(function(b) {
			return b.toString();
		}).join('');

		assert.equal(output, 'foo<!-- bar--></a></head>');
		assert.equal(pos, 18);
	});
});