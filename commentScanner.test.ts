import assert from 'node:assert';
import { CommentScanner, type Region } from './commentScanner';

const scanner = new CommentScanner();
let checks = 0;

function scan(code: string): Region[] {
	return scanner.scan(code);
}

function check(code: string, expected: { type: Region['type']; text: string }[]): void {
	const result = scan(code);

	assert.strictEqual(
		result.length,
		expected.length,
		`region count mismatch for ${JSON.stringify(code)}\n got: ${JSON.stringify(result)}\n exp: ${JSON.stringify(expected)}`
	);

	let offset = 0;
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(result[i].start, offset, `region ${i} start mismatch for ${JSON.stringify(code)}`);
		offset += expected[i].text.length;
		assert.strictEqual(result[i].end, offset, `region ${i} end mismatch for ${JSON.stringify(code)}`);
		assert.strictEqual(
			result[i].type,
			expected[i].type,
			`region ${i} type mismatch for ${JSON.stringify(code)}`
		);
		assert.strictEqual(
			result[i].text,
			expected[i].text,
			`region ${i} text mismatch for ${JSON.stringify(code)}`
		);
	}

	const joined = result.map((r) => r.text).join('');
	assert.strictEqual(joined, code, `integrity mismatch for ${JSON.stringify(code)}`);
	checks++;
}

check('', []);

check('hello world', [{ type: 'code', text: 'hello world' }]);

check('! comment\ncode', [
	{ type: 'comment', text: '! comment\n' },
	{ type: 'code', text: 'code' }
]);

check('code & ! comment\nmore', [
	{ type: 'code', text: 'code & ' },
	{ type: 'comment', text: '! comment\n' },
	{ type: 'code', text: 'more' }
]);

check('{ ! comment\ncode', [
	{ type: 'code', text: '{ ' },
	{ type: 'comment', text: '! comment\n' },
	{ type: 'code', text: 'code' }
]);

check('! "text" \ncode', [
	{ type: 'comment', text: '! "text" \n' },
	{ type: 'code', text: 'code' }
]);

check('! "text\ncontinues\n" \ncode', [
	{ type: 'comment', text: '! "text\ncontinues\n" \n' },
	{ type: 'code', text: 'code' }
]);

check('! { text } \ncode', [
	{ type: 'comment', text: '! { text } \n' },
	{ type: 'code', text: 'code' }
]);

check('{ ! comment } code', [
	{ type: 'code', text: '{ ' },
	{ type: 'comment', text: '! comment ' },
	{ type: 'code', text: '} code' }
]);

check('(! comment\n) code', [
	{ type: 'code', text: '(! comment\n) code' }
]);

check('(! comment\n] code', [
	{ type: 'code', text: '(! comment\n] code' }
]);

check('!\n! second\ncode', [
	{ type: 'comment', text: '!\n' },
	{ type: 'comment', text: '! second\n' },
	{ type: 'code', text: 'code' }
]);

check('a!b\nc', [
	{ type: 'code', text: 'a!b\nc' }
]);

check('! string with { brace \ncode', [
	{ type: 'comment', text: '! string with { brace \ncode' }
]);

// A colon starts a statement context, with or without spaces before the comment.
for (const newline of ['\n', '\r\n']) {
	for (const gap of ['', ' \t']) {
		const prefix = `if 1:${gap}`;
		const suffix = `msg 42${newline}end`;
		for (const comment of [
			'! ordinary comment',
			`! "quoted${newline}continued" tail`,
			`! 'quoted${newline}continued' tail`,
			`! { outer${newline}{ inner }${newline}} tail`
		]) {
			check(`${prefix}${comment}${newline}${suffix}`, [
				{ type: 'code', text: prefix },
				{ type: 'comment', text: `${comment}${newline}` },
				{ type: 'code', text: suffix }
			]);
		}
	}

	const prefix = `if (1 +${newline}2) = 3: `;
	const comment = `! {${newline}comment${newline}}${newline}`;
	const suffix = `msg 42${newline}end`;
	check(prefix + comment + suffix, [
		{ type: 'code', text: prefix },
		{ type: 'comment', text: comment },
		{ type: 'code', text: suffix }
	]);
}

// Complete and unfinished comments remain comments through the end of input.
for (const comment of [
	'! ordinary comment',
	'! { open\nstill comment',
	'! "open\nstill comment',
	"! 'open\nstill comment"
]) {
	check(`if 1: ${comment}`, [
		{ type: 'code', text: 'if 1: ' },
		{ type: 'comment', text: comment }
	]);
}

check('{ if 1: ! comment }', [
	{ type: 'code', text: '{ if 1: ' },
	{ type: 'comment', text: '! comment ' },
	{ type: 'code', text: '}' }
]);

// An executable brace creates a statement context even inside an argument list.
check('func({ if 1: ! comment })', [
	{ type: 'code', text: 'func({ if 1: ' },
	{ type: 'comment', text: '! comment ' },
	{ type: 'code', text: '})' }
]);

// A colon alone must not bypass string or round/square-bracket restrictions.
for (const code of [
	'(1: ! not a comment)',
	'[1: ! not a comment]',
	'({ value } : ! not a comment)',
	'[{ value } : ! not a comment]',
	'msg ": ! not a comment"',
	"msg ': ! not a comment'",
	'if 1: value ! not a comment'
]) {
	check(code, [{ type: 'code', text: code }]);
}

// Top-level location metadata is opaque to executable quote/bracket tracking.
for (const newline of ['\n', '\r\n']) {
	for (const indent of ['', ' \t']) {
		for (const marker of ['# ', '#\t', '-- ']) {
			for (const name of [
				"Bob's room",
				'Room "quoted',
				'Room (',
				'Room [',
				'Room {',
				'Room }',
				'Room & ! "not a comment',
				'Room: ! {not a comment',
				'中國.變數'
			]) {
				const prefix = `${indent}${marker}${name}${newline}`;
				const comment = `! {${newline}msg 42${newline}}${newline}`;
				check(`${prefix}${comment}msg 43`, [
					{ type: 'code', text: prefix },
					{ type: 'comment', text: comment },
					{ type: 'code', text: 'msg 43' }
				]);
			}
		}

		// A numeric prefix without a gap must still allow comments on that line.
		for (const statement of [
			'#value = 1 & ',
			'#arr[0] = 2 & ',
			'#args[0] & ',
			'#len("abc") & ',
			'#值 = 1 & '
		]) {
			const prefix = indent + statement;
			const comment = `! {${newline}comment${newline}}${newline}`;
			check(`${prefix}${comment}msg 43`, [
				{ type: 'code', text: prefix },
				{ type: 'comment', text: comment },
				{ type: 'code', text: 'msg 43' }
			]);
		}
	}
}

check("# Bob's room\n! first\n-- Bob's room\n! second\n# Next [ room\n! third\nmsg 42", [
	{ type: 'code', text: "# Bob's room\n" },
	{ type: 'comment', text: '! first\n' },
	{ type: 'code', text: "-- Bob's room\n" },
	{ type: 'comment', text: '! second\n' },
	{ type: 'code', text: '# Next [ room\n' },
	{ type: 'comment', text: '! third\n' },
	{ type: 'code', text: 'msg 42' }
]);

// Empty marker lines must not consume the following line; EOF needs no newline.
for (const metadata of ['#', '# \t', '--', "# Bob's room", '-- Room [', '# Room & ! {']) {
	check(metadata, [{ type: 'code', text: metadata }]);
	check(`${metadata}\n! comment\nmsg 42`, [
		{ type: 'code', text: `${metadata}\n` },
		{ type: 'comment', text: '! comment\n' },
		{ type: 'code', text: 'msg 42' }
	]);
}

// Marker-like text must still be scanned when it is inside a string or brackets.
for (const prefix of [
	'msg "first\n# Room"\n',
	"msg 'first\n-- Room'\n",
	"msg (\n--len('first\n! string content\n')\n)\n",
	"value = [\n--len('first\n! string content\n')\n]\n",
	"dynamic {\n--len('first\n! string content\n')\n}\n",
	"msg (\n# Room 'first\n! string content\n'\n)\n",
	"value = [\n# Room 'first\n! string content\n'\n]\n",
	"dynamic {\n# Room 'first\n! string content\n'\n}\n",
	"msg 1 & # Room 'first\n! string content\n'\n",
	"msg 1 & -- Room 'first\n! string content\n'\n",
	"#value = 'first\n! string content\n'\n"
]) {
	check(`${prefix}! comment\nmsg 42`, [
		{ type: 'code', text: prefix },
		{ type: 'comment', text: '! comment\n' },
		{ type: 'code', text: 'msg 42' }
	]);
}

// Location-like lines inside comments must not interrupt quote/brace balancing.
for (const comment of [
	'! "first\n# Room"\n',
	"! 'first\n-- Room'\n",
	'! {\n# Room }\n',
	'! {\n-- Room }\n'
]) {
	check(`${comment}msg 42`, [
		{ type: 'comment', text: comment },
		{ type: 'code', text: 'msg 42' }
	]);
}

// END notes share quote/brace balancing with comments, but stop before a bare &.
for (const newline of ['\n', '\r\n']) {
	for (const prefix of ['', ' \t', 'msg 0 & ', 'if 1: ', 'dynamic { ', 'func({ ']) {
		for (const marker of ['end', 'END', 'EnD']) {
			for (const note of [
				'if explanatory text',
				'!@ special note',
				`{ outer &${newline}{ inner } } tail`,
				`"quoted &${newline}" tail`,
				`'quoted &${newline}' tail`,
				`{ "brace } &" { inner } } "double "" & quote" 'apostrophe '' & quote' tail`
			]) {
				const head = `${prefix}${marker} \t`;
				check(`${head}${note}${newline}msg 42`, [
					{ type: 'code', text: head },
					{ type: 'comment', text: note + newline },
					{ type: 'code', text: 'msg 42' }
				]);
				check(`${head}${note} & msg 42`, [
					{ type: 'code', text: head },
					{ type: 'comment', text: note + ' ' },
					{ type: 'code', text: '& msg 42' }
				]);
			}
		}
	}
}

// No separator is required before punctuation; delimiters belong to the note.
for (const note of ['!note', '{ & }', '" & "', "' & '", ': tail', '(note', '[note', '=note', '?note']) {
	check(`end${note} & msg 42`, [
		{ type: 'code', text: 'end' },
		{ type: 'comment', text: note + ' ' },
		{ type: 'code', text: '& msg 42' }
	]);
}

for (const note of ['tail', '!@ tail', '{ open\n& still note', '"open\n& still note', "'open\n& still note"]) {
	check(`end ${note}`, [
		{ type: 'code', text: 'end ' },
		{ type: 'comment', text: note }
	]);
}

check('func({ end { nested } note }) & ! real\nmsg 42', [
	{ type: 'code', text: 'func({ end ' },
	{ type: 'comment', text: '{ nested } note ' },
	{ type: 'code', text: '}) & ' },
	{ type: 'comment', text: '! real\n' },
	{ type: 'code', text: 'msg 42' }
]);
check('end first & end second & ! explicit & retained\nmsg 42', [
	{ type: 'code', text: 'end ' },
	{ type: 'comment', text: 'first ' },
	{ type: 'code', text: '& end ' },
	{ type: 'comment', text: 'second ' },
	{ type: 'code', text: '& ' },
	{ type: 'comment', text: '! explicit & retained\n' },
	{ type: 'code', text: 'msg 42' }
]);

// Lexical statement context, not full block validation; expressions stay code.
for (const code of [
	'end', 'end \t', 'end\nmsg 42', 'end \r\nmsg 42', 'end & msg 42', '{end}',
	'ending = 1', 'end變 = 1', 'endé = 1', 'end|name = 1', 'end_ = 1', 'end1 = 1',
	'end#name = 1', 'end$name = 1', 'end%name = 1', 'end.field = 1',
	'#end = 1', '$end = 1', '%end = 1', '@end tail', '@@end tail',
	'value = end + 1', 'msg end tail', 'msg "end note & :label"', "msg 'end note & :label'",
	'(end tail)', '[end tail]', '(\nend tail\n)', '[\nend tail\n]',
	'({ value }: end tail)', '[{ value }: end tail]', '# end note', '-- end note'
]) {
	check(code, [{ type: 'code', text: code }]);
}

// Labels are opaque code: punctuation and reserved words cannot start comments.
for (const newline of ['\n', '\r\n']) {
	for (const prefix of ['', ' \t', 'msg 0 & ', 'if 1: ', 'dynamic { ']) {
		for (const label of [
			':end ignored', ':!label', ':!@label', ':name:!part', ':中國 😀', ':name ( [',
			`:"quoted &${newline}end ! text"`, `:{ nested &${newline}{ end ! } }`,
			`:'quote '' & end'`, ':"brace } & text"'
		]) {
			const head = prefix + label;
			for (const separator of [newline, ' & ']) {
				check(`${head}${separator}! real${newline}msg 42`, [
					{ type: 'code', text: head + separator },
					{ type: 'comment', text: '! real' + newline },
					{ type: 'code', text: 'msg 42' }
				]);
			}
		}
	}
}
check('dynamic {:end !label} & ! real\nmsg 42', [
	{ type: 'code', text: 'dynamic {:end !label} & ' },
	{ type: 'comment', text: '! real\n' },
	{ type: 'code', text: 'msg 42' }
]);
for (const label of [':!label', ':end note', ':"open\n& !label', ':{open\n& !label']) {
	check(label, [{ type: 'code', text: label }]);
}

console.log(`All ${checks} commentScanner tests passed`);
