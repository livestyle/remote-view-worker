var fs = require('fs');
var htmlMatcher = require('./lib/html-token-matcher');
var buf = fs.readFileSync('test/test.html');

var start2 = Date.now();
var _m2 = buf.toString('utf8').match(/<\/(head|body|html)>/i);
var m2 = _m2.index;
var end2 = Date.now();

var m = htmlMatcher();
var start = Date.now();
var m1 = m.search(buf);
var end = Date.now();

m.reset();
var start3 = Date.now();
var m3 = m.search2(buf);
var end3 = Date.now();

console.log('First match: %d @ %dms', m1, end - start);
console.log('Second match: %d @ %dms', m2, end2 - start2);
console.log('Third match: %d @ %dms', m3, end3 - start3);