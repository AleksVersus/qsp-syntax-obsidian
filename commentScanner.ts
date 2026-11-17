export type RegionType = 'code' | 'comment';

export interface Region {
	readonly type: RegionType;
	readonly text: string;
	readonly start: number;
	readonly end: number;
}

export class CommentScanner {
	scan(code: string): Region[] {
		const regions: Region[] = [];

		let regionStart = 0;
		let regionType: RegionType = 'code';
		type TextMode = 'comment' | 'note' | 'label';
		let textMode: TextMode | null = null;

		const stack: string[] = [];
		const commentStack: string[] = [];

		let inString: string | null = null;
		let inCommentString: string | null = null;
		let lastNonWhitespace: string | null = null;
		let atLineStart = true;

		const pushRegion = (type: RegionType, start: number, end: number): void => {
			if (end > start) {
				regions.push({ type, text: code.slice(start, end), start, end });
			}
		};

		// Labels remain code for Prism, but share opaque quote/brace scanning.
		const startText = (mode: TextMode, start: number): void => {
			if (mode !== 'label') {
				pushRegion('code', regionStart, start);
				regionStart = start;
				regionType = 'comment';
			}
			textMode = mode;
			commentStack.length = 0;
			inCommentString = null;
		};

		const finishText = (end: number): void => {
			if (regionType === 'comment') {
				pushRegion('comment', regionStart, end);
				regionStart = end;
				regionType = 'code';
			}
			textMode = null;
		};

		const isInsideRoundOrSquare = (): boolean => {
			for (let i = stack.length - 1; i >= 0; i--) {
				const s = stack[i];
				if (s === '(' || s === '[') {
					return true;
				}
				if (s === '{') {
					return false;
				}
			}
			return false;
		};

		for (let i = 0; i < code.length; i++) {
			const ch = code[i];
			const startsLine = atLineStart;
			atLineStart = ch === '\n' || (atLineStart && (ch === ' ' || ch === '\t'));

			if (textMode === null) {
				// Keep top-level location metadata in code regions for Prism, without
				// interpreting its punctuation. A gap after # protects typed variables.
				if (
					startsLine && inString === null && stack.length === 0 &&
					((ch === '#' && (code[i + 1] === ' ' || code[i + 1] === '\t')) ||
						(ch === '-' && code[i + 1] === '-'))
				) {
					const newline = code.indexOf('\n', i);
					// Process the newline normally so the next line can start a comment.
					i = newline === -1 ? code.length - 1 : newline - 1;
					continue;
				}

				if (inString !== null) {
					if (ch === inString) {
						inString = null;
					}
				} else {
					const lw = lastNonWhitespace;
					const atStatementStart =
						(lw === null || lw === '\n' || lw === '&' || lw === '{' || lw === ':') &&
						!isInsideRoundOrSquare();

					if (ch === ':' && atStatementStart) {
						startText('label', i);
						continue;
					}

					// Match a whole END at a lexical statement boundary, not an expression
					// or a longer/prefixed name. Block validity is deliberately not parsed.
					if (atStatementStart && (ch === 'e' || ch === 'E') &&
						code.slice(i, i + 3).toLowerCase() === 'end' &&
						(i + 3 === code.length || /[\s&'"(){}[\],:=!<>+\-/*\\;^@?]/.test(code[i + 3]))) {
						i += 2;
						lastNonWhitespace = code[i];
						let noteStart = i + 1;
						while (code[noteStart] === ' ' || code[noteStart] === '\t') noteStart++;
						// Keep empty tails and the gap after END in code, including its newline.
						if (noteStart < code.length && !/[\r\n&}]/.test(code[noteStart])) {
							startText('note', noteStart);
							i = noteStart - 1;
						}
						continue;
					}

					if (ch === '"' || ch === "'") {
						inString = ch;
					} else if (ch === '{') {
						stack.push('{');
					} else if (ch === '}') {
						if (stack.length > 0 && stack[stack.length - 1] === '{') {
							stack.pop();
						}
					} else if (ch === '[') {
						stack.push('[');
					} else if (ch === ']') {
						if (stack.length > 0 && stack[stack.length - 1] === '[') {
							stack.pop();
						}
					} else if (ch === '(') {
						stack.push('(');
					} else if (ch === ')') {
						if (stack.length > 0 && stack[stack.length - 1] === '(') {
							stack.pop();
						}
					} else if (ch === '!' && atStatementStart) {
						startText('comment', i);
					}
				}

				if (ch !== ' ' && ch !== '\t') {
					lastNonWhitespace = ch;
				}
			} else {
				if (inCommentString !== null) {
					if (ch === inCommentString) {
						inCommentString = null;
					}
				} else {
					if (ch === '"' || ch === "'") {
						inCommentString = ch;
					} else if (ch === '{') {
						commentStack.push('{');
					} else if (ch === '}') {
						if (commentStack.length > 0 && commentStack[commentStack.length - 1] === '{') {
							commentStack.pop();
						} else if (stack.length > 0 && stack[stack.length - 1] === '{') {
							finishText(i);
							stack.pop();
							lastNonWhitespace = null;
						}
					} else if (ch === '&' && textMode !== 'comment' && commentStack.length === 0) {
						// Unlike ! comments, labels and END notes stop before a bare &.
						finishText(i);
						lastNonWhitespace = '&';
					} else if (ch === '\n' && commentStack.length === 0) {
						finishText(i + 1);
						lastNonWhitespace = '\n';
					}
				}
			}
		}

		if (regionStart < code.length) {
			pushRegion(regionType, regionStart, code.length);
		}

		return regions;
	}
}
