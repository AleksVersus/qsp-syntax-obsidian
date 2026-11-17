import { CommentScanner } from './commentScanner';
import { collectHighlightRanges, type HighlightRange } from './highlightRanges';

// Run in a browser with its native DOMParser. The HTML fixtures represent Prism
// output; these tests exercise range conversion, not the QSP grammar or Obsidian UI.
export function runHighlightRangeTests() {
    let passed = 0;
    const failures: { name: string; message: string }[] = [];

    const test = (name: string, run: () => void): void => {
        try {
            run();
            passed++;
        } catch (error) {
            failures.push({ name, message: error instanceof Error ? error.message : String(error) });
        }
    };

    const assertRanges = (actual: HighlightRange[], expected: HighlightRange[]): void => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Expected ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
        }
    };

    const range = (start: number, end: number, className: string): HighlightRange => ({ start, end, className });
    const codeHtml = '<span class="token keyword">msg</span> <span class="token number">1</span>\n<span class="token keyword">end</span>';

    for (const padding of ['', '    ', '\t', '\n', '\n\n \t', ' \t\n    ']) {
        for (const base of [0, 137]) {
            test(`Leading whitespace ${JSON.stringify(padding)}, base ${base}`, () => {
                const ranges: HighlightRange[] = [];
                collectHighlightRanges(padding + codeHtml + ' \n', base, ranges);
                const start = base + padding.length;
                assertRanges(ranges, [
                    range(start, start + 3, 'token keyword'),
                    range(start + 4, start + 5, 'token number'),
                    range(start + 6, start + 9, 'token keyword')
                ]);
            });
        }
    }

    test('Nested interpolation tokens retain their ranges and classes', () => {
        const ranges: HighlightRange[] = [];
        const html = '  <span class="token string">&quot;<span class="token interpolation"><span class="token interpolation-punctuation punctuation">&lt;&lt;</span><span class="token user-variable">x</span><span class="token interpolation-punctuation punctuation">&gt;&gt;</span></span>&quot;</span> &amp; <span class="token keyword">msg</span>';
        collectHighlightRanges(html, 30, ranges);
        assertRanges(ranges, [
            range(33, 35, 'token interpolation-punctuation punctuation'),
            range(35, 36, 'token user-variable'),
            range(36, 38, 'token interpolation-punctuation punctuation'),
            range(33, 38, 'token interpolation'),
            range(32, 39, 'token string'),
            range(42, 45, 'token keyword')
        ]);
    });

    test('Entities decode once and Unicode uses UTF-16 source offsets', () => {
        const ranges: HighlightRange[] = [];
        const literal = `'😀<&>"'`;
        const html = ` \t<span class="token string">'😀&lt;&amp;&gt;&quot;'</span> &amp; <span class="token keyword">msg</span>`;
        collectHighlightRanges(html, 7, ranges);
        const end = 9 + literal.length;
        assertRanges(ranges, [range(9, end, 'token string'), range(end + 3, end + 6, 'token keyword')]);
    });

    test('Literal entity text is not decoded twice', () => {
        const ranges: HighlightRange[] = [];
        collectHighlightRanges('  &amp;lt; <span class="token keyword">msg</span>', 0, ranges);
        assertRanges(ranges, [range(7, 10, 'token keyword')]);
    });

    test('Classless containers advance positions without adding decorations', () => {
        const ranges: HighlightRange[] = [];
        collectHighlightRanges('<span> \t</span><span class="token keyword">msg</span>', 5, ranges);
        assertRanges(ranges, [range(7, 10, 'token keyword')]);
    });

    for (const html of ['', ' \t\n', 'plain text']) {
        test(`No decorations for ${JSON.stringify(html)}`, () => {
            const ranges: HighlightRange[] = [];
            collectHighlightRanges(html, 17, ranges);
            assertRanges(ranges, []);
        });
    }

    test('Separate code blocks append ranges without sharing a cursor', () => {
        const ranges: HighlightRange[] = [];
        collectHighlightRanges('  <span class="token keyword">msg</span>', 12, ranges);
        collectHighlightRanges('\n\t<span class="token number">42</span>', 80, ranges);
        assertRanges(ranges, [range(14, 17, 'token keyword'), range(82, 84, 'token number')]);
    });

    const scanner = new CommentScanner();
    for (const comment of ['! comment\n', '! {\nbody\n}\n', '! "multi\nline"\n']) {
        for (const padding of ['    ', '\t', '\n\n    ', '']) {
            test(`Scanner fragment after ${JSON.stringify(comment)} with ${JSON.stringify(padding)}`, () => {
                const ranges: HighlightRange[] = [];
                const base = 25;
                for (const region of scanner.scan(comment + padding + 'msg 1\nend')) {
                    if (region.type === 'comment') {
                        ranges.push(range(base + region.start, base + region.end, 'token comment'));
                    } else {
                        collectHighlightRanges(padding + codeHtml, base + region.start, ranges);
                    }
                }
                const start = base + comment.length + padding.length;
                assertRanges(ranges, [
                    range(base, base + comment.length, 'token comment'),
                    range(start, start + 3, 'token keyword'),
                    range(start + 4, start + 5, 'token number'),
                    range(start + 6, start + 9, 'token keyword')
                ]);
            });
        }
    }

    test('Original indented conditional keeps exact source slices after a comment', () => {
        const source = 'if 1:\n    ! comment\n    msg 1\nend';
        const ranges: HighlightRange[] = [];
        const base = 50;
        for (const region of scanner.scan(source)) {
            if (region.type === 'comment') {
                ranges.push(range(base + region.start, base + region.end, 'token comment'));
            } else {
                const html = region.start === 0
                    ? '<span class="token keyword">if</span> <span class="token number">1</span>:\n    '
                    : '    ' + codeHtml;
                collectHighlightRanges(html, base + region.start, ranges);
            }
        }
        const commentStart = source.indexOf('!');
        const commentEnd = source.indexOf('\n', commentStart) + 1;
        const msgStart = source.indexOf('msg');
        const endStart = source.lastIndexOf('end');
        assertRanges(ranges, [
            range(base, base + 2, 'token keyword'),
            range(base + 3, base + 4, 'token number'),
            range(base + commentStart, base + commentEnd, 'token comment'),
            range(base + msgStart, base + msgStart + 3, 'token keyword'),
            range(base + msgStart + 4, base + msgStart + 5, 'token number'),
            range(base + endStart, base + endStart + 3, 'token keyword')
        ]);
    });

    return { passed, failed: failures.length, failures };
}

export const results = runHighlightRangeTests();
console.log(JSON.stringify(results));
