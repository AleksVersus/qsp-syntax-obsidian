import assert from 'node:assert/strict';
import loadPrismWithQsp from './loadPrismWithQsp';
import { CommentScanner } from './commentScanner';

type TokenNode = string | { type: string; content: TokenNode | TokenNode[]; length: number };
type TokenSpan = { type: string; text: string; start: number; end: number };

// The Node runner substitutes only Obsidian's loadPrism with real PrismJS.
// The production loader and complete QSP grammar are exercised unchanged.
async function runPrismTokenTests() {
    const Prism = await loadPrismWithQsp();
    const scanner = new CommentScanner();
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

    const tokenize = (source: string, base = 0): TokenSpan[] => {
        const spans: TokenSpan[] = [];
        let offset = base;
        const visit = (node: TokenNode | TokenNode[]): string => {
            if (typeof node === 'string') {
                offset += node.length;
                return node;
            }
            if (Array.isArray(node)) return node.map(visit).join('');
            const start = offset;
            const text = visit(node.content);
            assert.equal(node.length, text.length, 'Token length preserves UTF-16 source length');
            assert.equal(source.slice(start - base, offset - base), text, 'Token source slice');
            spans.push({ type: node.type, text, start, end: offset });
            return text;
        };
        assert.equal(visit(Prism.tokenize(source, Prism.languages.qsp)), source, 'Source reconstruction');
        assert.equal(offset, base + source.length, 'Final source offset');
        return spans;
    };

    const locations = (spans: TokenSpan[]) => spans.filter(span => span.type === 'start-location');
    const span = (type: string, text: string, start: number): TokenSpan =>
        ({ type, text, start, end: start + text.length });
    const hasToken = (spans: TokenSpan[], type: string, text: string, start: number): void => {
        assert.ok(spans.some(token => token.type === type && token.text === text && token.start === start),
            `Missing ${type} ${JSON.stringify(text)} at ${start}: ${JSON.stringify(spans)}`);
    };

    for (const newline of ['\n', '\r\n']) {
        for (const indentation of ['', '    ', '\t']) {
            for (const separator of [' ', '\t', ' \t ']) {
                for (const name of ['room', "Bob's room", 'Room [', 'Комната 😀 ! & (']) {
                    test(`Header ${JSON.stringify({ newline, indentation, separator, name })}`, () => {
                        const header = `${indentation}#${separator}${name}`;
                        const prefix = `msg 0${newline}`;
                        const source = `${prefix}${header}${newline}msg 42`;
                        const tokens = tokenize(source);
                        assert.deepEqual(locations(tokens), [span('start-location', header, prefix.length)]);
                        hasToken(tokens, 'keyword', 'msg', source.lastIndexOf('msg'));
                        hasToken(tokens, 'number', '42', source.lastIndexOf('42'));
                    });
                }
            }
        }

        for (const indentation of ['', ' \t']) {
            for (const code of ['#name', '#value = 1', '#counter = 1', '#args[0]', "#len('abc')", "#LEN('abc')"]) {
                test(`Executable prefix ${JSON.stringify({ newline, indentation, code })}`, () => {
                    const source = `${indentation}${code}${newline}msg 42`;
                    const tokens = tokenize(source);
                    assert.deepEqual(locations(tokens), []);
                    if (/^#len/i.test(code)) {
                        hasToken(tokens, 'builtin', code.slice(0, 4), indentation.length);
                    } else {
                        // Exact typed system-variable tokens are checked separately below.
                        const name = code.match(/^#\w+/)![0];
                        assert.ok(tokens.some(token => ['user-variable', 'sys-variable'].includes(token.type)
                            && [name, name.slice(1)].includes(token.text)), 'Ordinary variable token');
                    }
                    if (code.endsWith('= 1')) {
                        hasToken(tokens, 'operator', '=', source.indexOf('='));
                        hasToken(tokens, 'number', '1', source.indexOf('1'));
                    }
                    hasToken(tokens, 'keyword', 'msg', source.lastIndexOf('msg'));
                    hasToken(tokens, 'number', '42', source.lastIndexOf('42'));
                });
            }
        }

        for (const marker of ['#', '# ', '#\t', ' \t# \t']) {
            for (const nextLine of ['msg 42', '    msg 42', '\tmsg 42', `${newline}msg 42`]) {
                test(`No cross-line header ${JSON.stringify({ newline, marker, nextLine })}`, () => {
                    const source = marker + newline + nextLine;
                    const tokens = tokenize(source);
                    assert.deepEqual(locations(tokens), []);
                    hasToken(tokens, 'keyword', 'msg', source.lastIndexOf('msg'));
                    hasToken(tokens, 'number', '42', source.lastIndexOf('42'));
                });
            }
            test(`Empty marker followed by a valid header ${JSON.stringify({ newline, marker })}`, () => {
                const prefix = marker + newline;
                const header = '# room';
                assert.deepEqual(locations(tokenize(prefix + header)), [span('start-location', header, prefix.length)]);
            });
        }

        test(`Scanner fragments with location metadata ${JSON.stringify(newline)}`, () => {
            const header = "  # Bob's room [";
            const footer = "-- Bob's room [";
            const comment = `! {${newline}comment${newline}}${newline}`;
            const source = `${header}${newline}${comment}    #value = 1${newline}${footer}${newline}! tail${newline}msg 42`;
            const tokens: TokenSpan[] = [];
            const regions = scanner.scan(source);
            assert.equal(regions.map(region => region.text).join(''), source);
            for (const region of regions) {
                if (region.type === 'comment') tokens.push(span('comment', region.text, region.start));
                else tokens.push(...tokenize(region.text, region.start));
            }
            assert.deepEqual(locations(tokens), [span('start-location', header, 0)]);
            hasToken(tokens, 'comment', comment, header.length + newline.length);
            hasToken(tokens, 'user-variable', '#value', source.indexOf('#value'));
            hasToken(tokens, 'end-location', footer, source.indexOf(footer));
            hasToken(tokens, 'comment', `! tail${newline}`, source.indexOf('! tail'));
            hasToken(tokens, 'keyword', 'msg', source.lastIndexOf('msg'));
        });

        for (const quote of ["'", '"']) {
            test(`Header-like line inside a string ${JSON.stringify({ newline, quote })}`, () => {
                const source = `msg ${quote}text${newline}# room${newline}text${quote}`;
                assert.deepEqual(locations(tokenize(source)), []);
            });
        }
    }

    for (const header of ['# room', '#\troom', ' \t# room  ']) {
        test(`Header at EOF ${JSON.stringify(header)}`, () => {
            assert.deepEqual(locations(tokenize(header)), [span('start-location', header, 0)]);
            const html = Prism.highlight(header, Prism.languages.qsp, 'qsp');
            assert.equal(html, `<span class="token start-location">${header}</span>`);
        });
    }

    for (const source of ['', '#', '# ', '#\t', ' \t# \t', '#name', 'msg 1 & # room', 'msg 1: # room', '! # room', '#\vroom', '#\froom', '#\u00a0room']) {
        test(`Not a location header ${JSON.stringify(source)}`, () => {
            assert.deepEqual(locations(tokenize(source)), []);
        });
    }

    test('Compact expressions produce code HTML without location styling', () => {
        const html = Prism.highlight("#value = 1\n#len('abc')", Prism.languages.qsp, 'qsp');
        assert.ok(!html.includes('start-location'));
        assert.ok(html.includes('<span class="token user-variable">#value</span>'));
        assert.ok(html.includes('<span class="token builtin">#len</span>'));
    });

    for (const prefix of ['', '#', '$', '%']) {
        for (const name of ['value', '_value', 'яблоки', '中國', '変数', 'café', 'cafe\u0301', 'Δείγμα', 'متغير', '😀', 'value|part', 'tick`name', 'price€', 'a#$%b', '變123']) {
            test(`Whole identifier ${JSON.stringify(prefix + name)}`, () => {
                const identifier = prefix + name;
                assert.deepEqual(tokenize(identifier, 17), [span('user-variable', identifier, 17)]);
            });
        }

        for (const word of ['len', 'counter', 'args', 'if', 'end', 'local', 'set', 'alias', 'and', 'mod', 'no', 'loc', 'obj']) {
            for (const name of [`變${word}`, `${word}變`, `é${word}`, `${word}é`, `x|${word}`, `${word}|x`, `my_${word}`]) {
                test(`Reserved substring stays in identifier ${JSON.stringify(prefix + name)}`, () => {
                    const identifier = prefix + name;
                    assert.deepEqual(tokenize(identifier), [span('user-variable', identifier, 0)]);
                });
            }
        }
    }

    // Core names checked against the QSP wiki; DISABLESUBEX is retained for legacy code.
    const systemNames = [
        'counter', 'ongload', 'ongsave', 'onnewloc', 'onactsel', 'onobjsel', 'onobjadd', 'onobjdel',
        'usercom', 'fname', 'backimage', 'args', 'result', 'nosave', 'disablescroll', 'disablesubex',
        'debug', 'usehtml', 'bcolor', 'fcolor', 'lcolor', 'fsize'
    ];
    for (const name of systemNames) {
        for (const prefix of ['', '#', '$', '%']) {
            for (const spelling of [name, name.toUpperCase()]) {
                test(`System variable ${prefix + spelling}`, () => {
                    const identifier = prefix + spelling;
                    assert.deepEqual(tokenize(identifier), [span('sys-variable', identifier, 0)]);
                });
            }
        }
    }

    for (const [type, name] of [
        ['user-variable', '中國'], ['builtin', '#len'], ['sys-variable', '%args'],
        ['keyword', 'if'], ['declarator', 'local'], ['operator', 'and'], ['number', '42']
    ]) {
        for (const delimiter of [' ', '\t', '\n', '\r\n', '&', '(', ')', '=', '<', '>', '+', '-', '/', '*', '\\', ',', ':', ';', '^', '.', '[', ']', '{', '}']) {
            test(`Name boundaries ${JSON.stringify({ type, name, delimiter })}`, () => {
                const source = `left${delimiter}${name}${delimiter}right`;
                hasToken(tokenize(source), type, name, 4 + delimiter.length);
            });
        }
    }

    for (const statement of ['*p', '*pl', '*nl', '*clear', '*clr', 'msg', 'else if']) {
        test(`Complete statement ${statement}`, () => {
            assert.deepEqual(tokenize(statement), [span('keyword', statement, 0)]);
        });
    }

    for (const call of ['@中文功能', '@@中文功能', '@функция', '@café', '@foo.bar']) {
        test(`Whole user call ${call}`, () => {
            assert.deepEqual(tokenize(call), [span('user-call', call, 0)]);
        });
    }
    for (const delimiter of [';', '\\', '@']) {
        test(`User call stops at ${JSON.stringify(delimiter)}`, () => {
            hasToken(tokenize(`@中文${delimiter}tail`), 'user-call', '@中文', 0);
        });
    }

    test('Record access keeps generic names and dot punctuation', () => {
        assert.deepEqual(tokenize('%中國.變數'), [
            span('user-variable', '%中國', 0), span('sign-punctuation', '.', 3), span('user-variable', '變數', 4)
        ]);
    });

    test('Typed variables, array indices, and builtins retain adjacent boundaries', () => {
        const source = '#args[0]+%result+#len($fname)';
        const tokens = tokenize(source);
        hasToken(tokens, 'sys-variable', '#args', 0);
        hasToken(tokens, 'number', '0', 6);
        hasToken(tokens, 'sys-variable', '%result', 9);
        hasToken(tokens, 'builtin', '#len', 17);
        hasToken(tokens, 'sys-variable', '$fname', 22);
    });

    test('Broad identifiers and typed system variables inside basic interpolation', () => {
        const source = '"Value: <<#args[0]+中國>>"';
        const tokens = tokenize(source);
        hasToken(tokens, 'sys-variable', '#args', source.indexOf('#args'));
        hasToken(tokens, 'user-variable', '中國', source.indexOf('中國'));
        hasToken(tokens, 'interpolation-punctuation', '>>', source.indexOf('>>'));
    });

    for (const quote of ["'", '"']) {
        test(`Identifier-like text remains a string ${quote}`, () => {
            const source = `${quote}#args 中國 len if 123${quote}`;
            assert.deepEqual(tokenize(source), [span('string', source, 0)]);
        });
    }

    test('Scanner fragments retain absolute offsets for broad identifiers', () => {
        const source = '# room\n! {\n#args 中國\n}\n    %result = 中國 + #args[0]';
        const tokens = scanner.scan(source).flatMap(region => region.type === 'code'
            ? tokenize(region.text, region.start)
            : [span('comment', region.text, region.start)]);
        hasToken(tokens, 'sys-variable', '%result', source.indexOf('%result'));
        hasToken(tokens, 'user-variable', '中國', source.lastIndexOf('中國'));
        hasToken(tokens, 'sys-variable', '#args', source.lastIndexOf('#args'));
        assert.equal(tokens.filter(token => token.type === 'sys-variable').length, 2);
    });

    test('Unicode identifiers keep their complete HTML token spans', () => {
        assert.equal(Prism.highlight('中國 & %args', Prism.languages.qsp, 'qsp'),
            '<span class="token user-variable">中國</span> <span class="token operator">&amp;</span> <span class="token sys-variable">%args</span>');
    });

    const scanTokens = (source: string, base = 0): TokenSpan[] => {
        const regions = scanner.scan(source);
        let offset = 0;
        const tokens: TokenSpan[] = [];
        for (const region of regions) {
            assert.equal(region.start, offset);
            assert.equal(region.text, source.slice(region.start, region.end));
            offset = region.end;
            tokens.push(...(region.type === 'code' ? tokenize(region.text, base + region.start)
                : [span('comment', region.text, base + region.start)]));
        }
        assert.equal(offset, source.length);
        assert.equal(regions.map(region => region.text).join(''), source);
        return tokens;
    };

    for (const newline of ['\n', '\r\n']) {
        for (const prefix of ['', 'msg 0 &', 'if 1:', 'dynamic {']) {
            for (const gap of ['', ' \t']) {
                for (const label of [':retry', ':end if', ':!label', ':name:!part', ':中國 😀', ':"name & part"', ':{ name & { part } }']) {
                    test(`Separator label ${JSON.stringify({ newline, prefix, gap, label })}`, () => {
                        const source = `${prefix}${gap}${label} & msg 42${newline}`;
                        const labelText = gap + label + ' ';
                        for (const tokens of [tokenize(source), scanTokens(source)]) {
                            assert.deepEqual(tokens.filter(token => token.type === 'label'), [span('label', labelText, prefix.length)]);
                            assert.deepEqual(tokens.filter(token => token.type === 'comment'), []);
                            hasToken(tokens, 'keyword', 'msg', source.lastIndexOf('msg'));
                            hasToken(tokens, 'number', '42', source.lastIndexOf('42'));
                            hasToken(tokens, 'operator', '&', source.lastIndexOf('&'));
                        }
                    });
                }
            }
        }

        for (const marker of ['end', 'END', 'EnD']) {
            for (const prefix of ['', '    ', 'msg 0 & ', 'if 1: ', 'dynamic { ']) {
                for (const note of ['if note', '!@ note', `{ outer &${newline}{ inner } } tail`, `"quoted "" &${newline}end" tail`, `'quoted '' &${newline}end' tail`]) {
                    test(`END note ${JSON.stringify({ newline, marker, prefix, note })}`, () => {
                        const source = `${prefix}${marker} ${note} & :retry & msg 42${newline}`;
                        const base = 23;
                        const tokens = scanTokens(source, base);
                        hasToken(tokens, 'keyword', marker, base + prefix.length);
                        assert.deepEqual(tokens.filter(token => token.type === 'comment'), [span('comment', note + ' ', base + prefix.length + marker.length + 1)]);
                        hasToken(tokens, 'label', ' :retry ', base + source.indexOf(':retry') - 1);
                        hasToken(tokens, 'keyword', 'msg', base + source.lastIndexOf('msg'));
                        hasToken(tokens, 'number', '42', base + source.lastIndexOf('42'));
                    });
                }
            }
        }
    }

    for (const source of [
        'msg ":label & :end"', "msg ':label & :end'", '! :label & :end',
        'if 1: msg 42', 'value = 1: name', '# room & :label', '-- room & :label'
    ]) {
        test(`Not a label ${JSON.stringify(source)}`, () => {
            assert.deepEqual(scanTokens(source).filter(token => token.type === 'label'), []);
        });
    }

    test('Adjacent labels and an enclosing executable brace keep their boundaries', () => {
        const source = 'dynamic {:first&:!second} & msg 42';
        const tokens = scanTokens(source);
        hasToken(tokens, 'label', ':first', source.indexOf(':first'));
        hasToken(tokens, 'label', ':!second', source.indexOf(':!second'));
        hasToken(tokens, 'sign-punctuation', '}', source.indexOf('}'));
        hasToken(tokens, 'keyword', 'msg', source.indexOf('msg'));
    });

    test('Labels protect scanner state before multiline comments', () => {
        const source = 'msg 0 & :end !label\n! {\ncomment\n}\n    %result = 中國';
        const tokens = scanTokens(source);
        hasToken(tokens, 'label', ' :end !label', source.indexOf(':end') - 1);
        assert.deepEqual(tokens.filter(token => token.type === 'comment'), [span('comment', '! {\ncomment\n}\n', source.indexOf('! {'))]);
        hasToken(tokens, 'sys-variable', '%result', source.indexOf('%result'));
    });

    test('END-note fragments keep following indentation and executable braces', () => {
        const source = 'dynamic {end { note & } tail}\n    %result = 中國';
        const tokens = scanTokens(source);
        hasToken(tokens, 'keyword', 'end', source.indexOf('end'));
        hasToken(tokens, 'comment', '{ note & } tail', source.indexOf('{ note'));
        hasToken(tokens, 'sign-punctuation', '}', source.lastIndexOf('}'));
        hasToken(tokens, 'sys-variable', '%result', source.indexOf('%result'));
    });

    test('Label HTML retains its class and escaped separator', () => {
        assert.equal(Prism.highlight('msg 0 & :retry', Prism.languages.qsp, 'qsp'),
            '<span class="token keyword">msg</span> <span class="token number">0</span> <span class="token operator">&amp;</span><span class="token label"> :retry</span>');
    });

    for (const outerQuote of ['"', "'"]) {
        const innerQuote = outerQuote === '"' ? "'" : '"';
        for (const newline of ['\n', '\r\n']) {
            for (const content of [
                '', '>>', 'before >> after', '<<', '< >', 'end & :label { }',
                `before${innerQuote}${innerQuote}>>after`,
                `${innerQuote}${innerQuote}>>${innerQuote}${innerQuote}`,
                `before${newline}>> after`,
                `outer ${outerQuote}${outerQuote}quote${outerQuote}${outerQuote} >>`
            ]) {
                test(`Quoted interpolation delimiter ${JSON.stringify({ outerQuote, newline, content })}`, () => {
                    const literal = innerQuote + content + innerQuote;
                    const expression = `<<len(${literal}) + 中國 + #args[0]>>`;
                    const string = `${outerQuote}😀 before ${expression} after${outerQuote}`;
                    const source = `msg ${string}${newline}msg 42`;
                    const base = 19;
                    for (const tokens of [tokenize(source, base), scanTokens(source, base)]) {
                        hasToken(tokens, 'string', string, base + 4);
                        hasToken(tokens, 'string', literal, base + source.indexOf(literal));
                        assert.deepEqual(tokens.filter(token => token.type === 'interpolation'),
                            [span('interpolation', expression, base + source.indexOf('<<'))]);
                        assert.deepEqual(tokens.filter(token => token.type === 'interpolation-punctuation'), [
                            span('interpolation-punctuation', '<<', base + source.indexOf('<<')),
                            span('interpolation-punctuation', '>>', base + source.lastIndexOf('>>'))
                        ]);
                        hasToken(tokens, 'builtin', 'len', base + source.indexOf('len'));
                        hasToken(tokens, 'sys-variable', '#args', base + source.indexOf('#args'));
                        hasToken(tokens, 'user-variable', '中國', base + source.indexOf('中國'));
                        hasToken(tokens, 'keyword', 'msg', base + source.lastIndexOf('msg'));
                        assert.deepEqual(tokens.filter(token => token.type === 'comment'), []);
                    }
                });
            }

            test(`Adjacent interpolations ${JSON.stringify({ outerQuote, newline })}`, () => {
                const first = `<<${innerQuote}>>${innerQuote}>>`;
                const second = '<<#args[0]>>';
                const third = `<<len(${innerQuote}a${innerQuote}${innerQuote}>>b${innerQuote})>>`;
                const source = `${outerQuote}${first}${second}${newline}${third}${outerQuote}`;
                const tokens = scanTokens(source);
                assert.deepEqual(tokens.filter(token => token.type === 'interpolation'), [first, second, third]
                    .map(expression => span('interpolation', expression, source.indexOf(expression))));
            });

            test(`Interpolation after scanner fragments ${JSON.stringify({ outerQuote, newline })}`, () => {
                const expression = `<<${innerQuote}>>${innerQuote}>>`;
                const source = `! {${newline}comment${newline}}${newline}    msg ${outerQuote}${expression}${outerQuote}${newline}end note & msg 42`;
                const tokens = scanTokens(source, 37);
                hasToken(tokens, 'interpolation', expression, 37 + source.indexOf(expression));
                hasToken(tokens, 'comment', 'note ', 37 + source.indexOf('note'));
                hasToken(tokens, 'keyword', 'msg', 37 + source.lastIndexOf('msg'));
            });
        }

        for (const content of [
            'plain text >>', '<<missing', `<<${innerQuote}>>`,
            `<<${innerQuote}unclosed${innerQuote}${innerQuote}>>`,
            `<<${innerQuote}closed${innerQuote} missing >`,
            `<<${outerQuote}${outerQuote}same quote >>${outerQuote}${outerQuote}>>`
        ]) {
            test(`Incomplete or unsupported interpolation stays string text ${JSON.stringify({ outerQuote, content })}`, () => {
                const string = outerQuote + content + outerQuote;
                const source = `msg ${string}\nmsg 42`;
                const tokens = scanTokens(source);
                assert.deepEqual(tokens.filter(token => token.type === 'interpolation'), []);
                hasToken(tokens, 'string', string, 4);
                hasToken(tokens, 'keyword', 'msg', source.lastIndexOf('msg'));
            });
        }

        test(`Outer doubled quotes do not hide a basic interpolation ${outerQuote}`, () => {
            const source = `${outerQuote}said ${outerQuote}${outerQuote}<<中國>>${outerQuote}${outerQuote}${outerQuote}`;
            const tokens = scanTokens(source);
            hasToken(tokens, 'string', source, 0);
            hasToken(tokens, 'interpolation', '<<中國>>', source.indexOf('<<'));
        });

        test(`A nested basic interpolation inside the opposite quoted string survives ${outerQuote}`, () => {
            const nested = '<<#args[0]>>';
            const expression = `<<len(${innerQuote}${nested}${innerQuote})>>`;
            const source = outerQuote + expression + outerQuote;
            const tokens = scanTokens(source);
            hasToken(tokens, 'interpolation', expression, 1);
            hasToken(tokens, 'interpolation', nested, source.indexOf(nested));
            hasToken(tokens, 'sys-variable', '#args', source.indexOf('#args'));
        });

        for (const separator of [' + ', '\nmsg ', ' & msg ']) {
            test(`Mixed outer string boundaries ${JSON.stringify({ outerQuote, separator })}`, () => {
                const first = `${outerQuote}left ${innerQuote}quote${innerQuote}${outerQuote}`;
                const second = `${innerQuote}right ${outerQuote}quote${outerQuote}${innerQuote}`;
                const source = first + separator + second;
                assert.deepEqual(scanTokens(source).filter(token => token.type === 'string'), [
                    span('string', first, 0), span('string', second, first.length + separator.length)
                ]);
            });
        }

        test(`Incomplete candidate cannot consume the next outer string ${outerQuote}`, () => {
            const incomplete = `${outerQuote}<<${innerQuote}unclosed >>${outerQuote}`;
            const expression = `<<${innerQuote}>>${innerQuote}>>`;
            const source = `msg ${incomplete}\nmsg ${outerQuote}${expression}${outerQuote}`;
            assert.deepEqual(scanTokens(source).filter(token => token.type === 'interpolation'), [
                span('interpolation', expression, source.lastIndexOf('<<'))
            ]);
        });

        test(`Long doubled-quote run in an incomplete candidate ${outerQuote}`, () => {
            const source = `${outerQuote}<<${innerQuote}${innerQuote.repeat(1024)}missing >>${outerQuote}`;
            assert.deepEqual(tokenize(source), [span('string', source, 0)]);
        });

        for (const wrap of [(text: string) => `dynamic {msg ${text}}`, (text: string) => `%value = [${text}, 1]`]) {
            test(`Quoted interpolation within a code block or tuple ${outerQuote} ${wrap('text')}`, () => {
                const expression = `<<${innerQuote}>>${innerQuote}>>`;
                const source = wrap(outerQuote + expression + outerQuote);
                hasToken(scanTokens(source), 'interpolation', expression, source.indexOf(expression));
            });
        }
    }

    for (const source of ['! "<<1>>"', 'end "<<1>>"', ':label "<<1>>"', '# room "<<1>>"']) {
        test(`Metadata, labels, and comments do not gain interpolation ${source}`, () => {
            assert.deepEqual(scanTokens(source).filter(token => token.type === 'interpolation'), []);
        });
    }

    test('Quoted closing delimiter remains inside a string HTML span', () => {
        const html = Prism.highlight(`"<<'>>'>>"`, Prism.languages.qsp, 'qsp');
        assert.equal(html, '<span class="token string">"<span class="token interpolation"><span class="token interpolation-punctuation punctuation">&lt;&lt;</span><span class="token string">\'>>\'</span><span class="token interpolation-punctuation punctuation">>></span></span>"</span>');
    });

    // These independent expectations cover the existing lexical inventory, not runtime validity.
    const keywordNames = [
        'play', 'close', 'view', 'exit', 'jump', 'gosub', 'gs', 'goto', 'gt', 'xgoto', 'xgt',
        'pl', 'p', 'nl', 'clear', 'clr', '*pl', '*p', '*nl', '*clear', '*clr',
        'msg', 'wait', 'addobj', 'delobj', 'modobj', 'resetobj', 'killobj', 'unselect', 'unsel',
        'killall', 'cla', 'delact', 'cls', 'cmdclear', 'cmdclr', 'menu', 'settimer', 'dynamic',
        'setvar', 'insvar', 'killvar', 'copyarr', 'movearr', 'sortarr', 'scanstr', 'unpackarr',
        'opengame', 'savegame', 'openqst', 'inclib', 'freelib', 'refint',
        'showacts', 'showinput', 'showobjs', 'showstat',
        'act', 'if', 'elseif', 'else', 'loop', 'while', 'step', 'end'
    ];
    const builtinNames = [
        'desc', 'max', 'min', 'rand', 'rnd', 'val', 'iif', 'dyneval', 'func',
        'input', 'usrtxt', 'user_text', 'maintxt', 'stattxt', 'getobj', 'countobj', 'selobj',
        'curloc', 'curobjs', 'selact', 'curacts', 'arrsize', 'arrtype', 'arrkey', 'arritem',
        'arrpack', 'arrpos', 'arrcomp', 'strcomp', 'strfind', 'strpos', 'instr', 'isnum',
        'trim', 'ucase', 'lcase', 'len', 'mid', 'replace', 'str', 'isplay', 'rgb', 'msecscount', 'qspver'
    ];
    for (const [type, names] of [
        ['keyword', keywordNames],
        ['builtin', builtinNames.flatMap(name => ['', '#', '$', '%'].map(prefix => prefix + name))],
        ['declarator', ['local', 'set', 'let', 'alias']],
        ['operator', ['and', 'or', 'mod', 'no', 'obj', 'loc']]
    ] as const) {
        for (const name of names) {
            for (const spelling of [name, name.toUpperCase()]) {
                test(`Lexical inventory ${type} ${spelling}`, () => {
                    const source = ` \t${spelling}\r\n`;
                    const expected = [span(type, spelling, 33)];
                    assert.deepEqual(tokenize(source, 31), expected);
                    assert.deepEqual(scanTokens(source, 31), expected);
                });
            }
        }
    }

    // Whitespace is the only omitted source text; exact spans reject extra/missing tokens.
    const sequenceSpans = (source: string, pieces: [string, string][], base: number): TokenSpan[] => {
        let cursor = 0;
        const expected = pieces.map(([type, text]) => {
            const start = source.indexOf(text, cursor);
            assert.notEqual(start, -1, `Missing fixture text ${JSON.stringify(text)}`);
            assert.match(source.slice(cursor, start), /^\s*$/, 'Only whitespace between expected tokens');
            cursor = start + text.length;
            return span(type, text, base + start);
        });
        assert.match(source.slice(cursor), /^\s*$/, 'Only whitespace after expected tokens');
        return expected;
    };
    const checkSequence = (source: string, pieces: [string, string][], wrapper?: string): void => {
        const base = 31;
        const expected = sequenceSpans(source, pieces, base);
        // The shared traversal records a wrapper after all of its children.
        if (wrapper) expected.push(span(wrapper, source, base));
        assert.deepEqual(tokenize(source, base), expected);
        assert.deepEqual(scanTokens(source, base), expected);
    };

    for (const operator of ['<=', '>=', '<>', '=<', '=>', '+=', '-=', '*=', '/=', '+', '-', '*', '/', '=', '<', '>', '!', '&']) {
        test(`Complete symbolic operator ${operator}`, () => {
            checkSequence(`value${operator}2`, [['user-variable', 'value'], ['operator', operator], ['number', '2']]);
        });
    }
    for (const number of ['0', '007', '42', '2147483647', '9223372036854775807', '?']) {
        for (const sign of ['+', '-']) {
            test(`Unary sign stays separate from number ${sign}${number}`, () => {
                checkSequence(`msg ${sign}${number}`, [['keyword', 'msg'], ['operator', sign], ['number', number]]);
            });
        }
    }
    for (const gap of [' ', '\t', ' \t ', '\n', '\r\n']) {
        test(`Multiword keyword retains whitespace ${JSON.stringify(gap)}`, () => {
            checkSequence(`ElSe${gap}If value: msg 1`, [
                ['keyword', `ElSe${gap}If`], ['user-variable', 'value'], ['sign-punctuation', ':'],
                ['keyword', 'msg'], ['number', '1']
            ]);
        });
    }

    const expressions: { name: string; source: string; pieces: [string, string][] }[] = [
        {
            name: 'Declaration, unary arithmetic, and typed builtin',
            source: 'let #value = -42 + #len("café")',
            pieces: [
                ['declarator', 'let'], ['user-variable', '#value'], ['operator', '='], ['operator', '-'],
                ['number', '42'], ['operator', '+'], ['builtin', '#len'], ['sign-punctuation', '('],
                ['string', '"café"'], ['sign-punctuation', ')']
            ]
        },
        {
            name: 'Logical operators, comparisons, and starred output',
            source: 'if no (left <= right) and obj "key": *pl "ok"',
            pieces: [
                ['keyword', 'if'], ['operator', 'no'], ['sign-punctuation', '('], ['user-variable', 'left'],
                ['operator', '<='], ['user-variable', 'right'], ['sign-punctuation', ')'], ['operator', 'and'],
                ['operator', 'obj'], ['string', '"key"'], ['sign-punctuation', ':'], ['keyword', '*pl'], ['string', '"ok"']
            ]
        },
        {
            name: 'Loop header with a compound assignment',
            source: 'loop local i=0 while i<3 step i+=1:',
            pieces: [
                ['keyword', 'loop'], ['declarator', 'local'], ['user-variable', 'i'], ['operator', '='],
                ['number', '0'], ['keyword', 'while'], ['user-variable', 'i'], ['operator', '<'], ['number', '3'],
                ['keyword', 'step'], ['user-variable', 'i'], ['operator', '+='], ['number', '1'], ['sign-punctuation', ':']
            ]
        },
        {
            name: 'User calls, optional gap, dotted names, and argument punctuation',
            source: 'msg @ foo.bar(1, "a") & @@worker 2',
            pieces: [
                ['keyword', 'msg'], ['user-call', '@ foo.bar'], ['sign-punctuation', '('], ['number', '1'],
                ['sign-punctuation', ','], ['string', '"a"'], ['sign-punctuation', ')'], ['operator', '&'],
                ['user-call', '@@worker'], ['number', '2']
            ]
        },
        {
            name: 'Record fields and question mark retain generic styling',
            source: 'set %record.field = ?',
            pieces: [
                ['declarator', 'set'], ['user-variable', '%record'], ['sign-punctuation', '.'],
                ['user-variable', 'field'], ['operator', '='], ['number', '?']
            ]
        },
        {
            name: 'Local list, comma, and semicolon token boundaries',
            source: 'local a, b = 1, 2 & msg a; msg b',
            pieces: [
                ['declarator', 'local'], ['user-variable', 'a'], ['sign-punctuation', ','], ['user-variable', 'b'],
                ['operator', '='], ['number', '1'], ['sign-punctuation', ','], ['number', '2'], ['operator', '&'],
                ['keyword', 'msg'], ['user-variable', 'a'], ['sign-punctuation', ';'], ['keyword', 'msg'], ['user-variable', 'b']
            ]
        }
    ];
    for (const { name, source, pieces } of expressions) {
        test(`Complete expression: ${name}`, () => checkSequence(source, pieces));
    }

    for (const newline of ['\n', '\r\n']) {
        for (const quote of ['"', "'"]) {
            for (const content of [
                '', 'if msg len #args @worker no local 42 ! { [ :label',
                `escaped ${quote}${quote} quote`, '中國 😀 & <tag>', `first${newline}second`
            ]) {
                test(`Opaque quoted literal ${JSON.stringify({ newline, quote, content })}`, () => {
                    const literal = quote + content + quote;
                    checkSequence(`msg ${literal}${newline}msg 42`, [
                        ['keyword', 'msg'], ['string', literal], ['keyword', 'msg'], ['number', '42']
                    ]);
                });
            }
        }
        for (const type of ['code-block', 'tuple']) {
            const [open, close] = type === 'code-block' ? ['{', '}'] : ['[', ']'];
            for (const depth of [1, 3]) {
                test(`Bounded wrapper ${type}, depth ${depth}, ${JSON.stringify(newline)}`, () => {
                    const opening = open.repeat(depth);
                    const closing = close.repeat(depth);
                    const literal = `"${close}${open}"`;
                    const source = `${opening}${newline}1, ${literal}${newline}${closing}`;
                    const pieces: [string, string][] = [
                        ...Array.from({ length: depth }, (): [string, string] => ['sign-punctuation', open]),
                        ['number', '1'], ['sign-punctuation', ','], ['string', literal],
                        ...Array.from({ length: depth }, (): [string, string] => ['sign-punctuation', close])
                    ];
                    checkSequence(source, pieces, type);
                });
            }
        }
    }

    test('Code-block inner grammar keeps expressions but does not recursively wrap tuples', () => {
        checkSequence('{msg "}" & %result = [1, 2]}', [
            ['sign-punctuation', '{'], ['keyword', 'msg'], ['string', '"}"'], ['operator', '&'],
            ['sys-variable', '%result'], ['operator', '='], ['sign-punctuation', '['], ['number', '1'],
            ['sign-punctuation', ','], ['number', '2'], ['sign-punctuation', ']'], ['sign-punctuation', '}']
        ], 'code-block');
    });
    test('Tuple inner grammar keeps a call and nested delimiters without recursive wrappers', () => {
        checkSequence('[%args, @worker(2), {msg 3}]', [
            ['sign-punctuation', '['], ['sys-variable', '%args'], ['sign-punctuation', ','], ['user-call', '@worker'],
            ['sign-punctuation', '('], ['number', '2'], ['sign-punctuation', ')'], ['sign-punctuation', ','],
            ['sign-punctuation', '{'], ['keyword', 'msg'], ['number', '3'], ['sign-punctuation', '}'], ['sign-punctuation', ']']
        ], 'tuple');
    });
    for (const [source, type, open, close] of [
        ['{}', 'code-block', '{', '}'], ['[]', 'tuple', '[', ']']
    ]) {
        test(`Empty wrapper and punctuation alias ${type}`, () => {
            checkSequence(source, [['sign-punctuation', open], ['sign-punctuation', close]], type);
            assert.equal(Prism.highlight(source, Prism.languages.qsp, 'qsp'),
                `<span class="token ${type} punctuation"><span class="token sign-punctuation">${open}</span><span class="token sign-punctuation">${close}</span></span>`);
        });
    }
    test('HTML retains operator escaping and opaque literal content', () => {
        assert.equal(Prism.highlight('value<=2 & msg "<tag>&"', Prism.languages.qsp, 'qsp'),
            '<span class="token user-variable">value</span><span class="token operator">&lt;=</span><span class="token number">2</span> <span class="token operator">&amp;</span> <span class="token keyword">msg</span> <span class="token string">"&lt;tag>&amp;"</span>');
    });

    for (const newline of ['\n', '\r\n']) {
        for (const comment of ['! explicit & still comment', '!@ special', '! { outer "}" { inner } }']) {
            test(`Mixed program across scanner fragments ${JSON.stringify({ newline, comment })}`, () => {
                const source = `# sample${newline}:start${newline}${comment}${newline}    let 中國 = -2${newline}end note & msg @worker(中國)${newline}-- sample`;
                const expected = sequenceSpans(source, [
                    ['start-location', '# sample'], ['label', ':start'], ['comment', comment + newline],
                    ['declarator', 'let'], ['user-variable', '中國'], ['operator', '='], ['operator', '-'], ['number', '2'],
                    ['keyword', 'end'], ['comment', 'note '], ['operator', '&'], ['keyword', 'msg'],
                    ['user-call', '@worker'], ['sign-punctuation', '('], ['user-variable', '中國'],
                    ['sign-punctuation', ')'], ['end-location', '-- sample']
                ], 53);
                assert.deepEqual(scanTokens(source, 53), expected);
            });
        }
    }

    console.log(JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
}

void runPrismTokenTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
