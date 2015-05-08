/**
 * Streaming token matcher
 */
'use strict'

var debug = require('debug')('rv-html-matcher');

var lt = charCode('<');
var excl = charCode('!');
var slash = charCode('/');
var tokens = [word('head>'), word('body>'), word('html>')];
var commentStart = word('--');
var commentEnd = word('-->');
var commentStart2 = new Buffer('--');
var commentEnd2 = new Buffer('-->');

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
					let ret = 0;
					for (let i = this.offset; i < len; i++) {
						ret = lookupWord(buf, i, commentEnd);
						if (ret === -1) {
							this.offset = i;
							return -1;
						}

						if (ret === 1) {
							this.inComment = false;
							this.offset = i + commentEnd.length;
							break;
						}
					}

					if (ret === 1) {
						continue;
					}

					// comment end must be in next chunk
					this.offset = len;
					return 0;
				}


				let ch = buf[this.offset];
				if (ch === lt) {
					let chnext = buf[this.offset + 1];
					if (chnext === undefined) {
						// not enough data
						return -1;
					}

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
							this.offset += 4;
							this.inComment = true;
							continue;
						}
					}
				}
				this.offset++;
			}

			return -1;
		},
		search2(buf) {
			if (!Buffer.isBuffer(buf)) {
				buf = new Buffer(buf);
			}

			var len = buf.length;
			var last = len - 1;
			while (this.offset < buf.length) {
				if (this.inComment) {
					// we are inside HTML comment:
					// adjust offset until the end of comment
					let ix = buf.indexOf(commentEnd2, this.offset);
					if (ix === -1) {
						// unable to find comment end, need more data
						this.offset = len;
						return -1;
					}

					this.offset = ix + commentEnd2.length;
					this.inComment = false;
					continue;
				}

				let ltIx = buf.indexOf(lt, this.offset);
				if (ltIx === -1) {
					this.offset = len;
					return -1;
				}

				this.offset = ltIx;

				let chnext = buf[ltIx + 1];
				if (chnext === undefined) {
					// not enough data
					return -1;
				}

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
						this.offset += 4;
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

/**
 * Lookup word in stream. Return values:
 * -1: possible match but not enough data
 *  0: does not match
 *  1: match
 */
function lookupWord(buf, start, word) {
	var i = 0, ch;
	// return -1;
	while (i < word.length) {
		ch = buf[start + i];
		if (ch === undefined) {
			return -1;
		}

		if (ch !== word.lower[i] && ch !== word.upper[i]) {
			return 0;
		}
		i++;
	}

	return 1;
}