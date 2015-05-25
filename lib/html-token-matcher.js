/**
 * Streaming token matcher
 */
'use strict';

var lt = charCode('<');
var excl = charCode('!');
var slash = charCode('/');
var dash = charCode('-');
var tokens = [word('head>'), word('body>'), word('html>')];
var commentStart = new Buffer('--');
var commentEnd = new Buffer('-->');

module.exports = function() {
	return {
		offset: 0,
		inComment: false,
		reset() {
			this.offset = 0;
			this.inComment = false;
		},
		shift(buf) {
			if (this.offset !== buf.length) {
				// do not copy buffer if whole chunk
				// was processed
				buf = buf.slice(0, this.offset);
			}
			this.offset = 0;
			return buf;
		},
		search(buf) {
			if (!Buffer.isBuffer(buf)) {
				buf = new Buffer(buf);
			}

			var len = buf.length;
			var last = len - 1;
			while (this.offset < buf.length) {
				if (this.inComment) {
					// we are inside HTML comment:
					// adjust offset until the end of comment
					let ix = buf.indexOf(commentEnd, this.offset);
					if (ix === -1) {
						// unable to find comment end, need more data
						
						// optimistic lookup: move pointer to next
						// dash 
						ix = buf.indexOf(dash, this.offset);
						if (ix !== -1) {
							this.offset = ix;
						} else {
							this.offset = len;
						}
						return -1;
					}

					this.offset = ix + commentEnd.length;
					this.inComment = false;
					continue;
				}

				// search for nearest < char
				let ltIx = buf.indexOf(lt, this.offset);
				if (ltIx === -1) {
					this.offset = len;
					return -1;
				}

				this.offset = ltIx;
				if (ltIx === last) {
					// not enough data
					return -1;
				}

				let chnext = buf[ltIx + 1];
				if (chnext === slash) {
					// possible closing tag match
					let _offset = this.offset + 2;
					for (let j = 0, jl = tokens.length; j < jl; j++) {
						let res = lookupWord(buf, _offset, tokens[j]);
						if (res === 1) {
							return this.offset;
						}

						if (res === -1) {
							// not enough data, need more
							return -1;
						}
					}
				} else if (chnext === excl) {
					// possible comment start:
					// we have to ignore everything inside it
					let res = lookupWord(buf, this.offset + 2, commentStart);
					if (res === -1) {
						// maybe in comment, but not enough data
						return -1;
					}

					if (res === 1) {
						this.offset += 2 + commentStart.length;
						this.inComment = true;
						continue;
					}
				}
				
				this.offset++;
			}

			return -1;
		}
	};
};

function charCode(ch) {
	return ch.charCodeAt(0);
}

function split(str) {
	return str.split('').map(charCode);
}

function word(str) {
	return {
		lower: split(str.toLowerCase()),
		upper: split(str.toUpperCase()),
		length: str.length
	};
}

function cmpBuf(ch, word, i) {
	return ch === word[i];
}

function cmpWord(ch, word, i) {
	return ch === word.lower[i] || ch === word.upper[i];
}

/**
 * Lookup word in stream. Return values:
 * -1: possible match but not enough data
 *  0: does not match
 *  1: match
 */
function lookupWord(buf, start, word) {
	var i = 0, ch;
	var cmp = Buffer.isBuffer(word) ? cmpBuf : cmpWord;

	while (i < word.length) {
		ch = buf[start + i];
		if (ch === undefined) {
			return -1;
		}

		if (!cmp(ch, word, i)) {
			return 0;
		}

		i++;
	}

	return 1;
}