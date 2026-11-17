/* eslint-disable no-useless-escape */
// Based on QSP grammar (qsp_grammar.peg): case-insensitive keywords, statements, functions.
import { loadPrism } from "obsidian";

const applyPrismQsp = (Prism: any) => {
    const statements = [
        "play", "close", "view", "exit", "jump",
        "gosub", "gs", "goto", "gt", "xgoto", "xgt",
        "pl", "p", "nl", "clear", "clr",
        "\\*pl", "\\*p", "\\*nl", "\\*clear", "\\*clr",
        "msg", "wait", "addobj", "delobj", "modobj", "resetobj", "killobj",
        "unselect", "unsel", "killall", "cla", "delact", "cls",
        "cmdclear", "cmdclr", "menu", "settimer", "dynamic",
        "setvar", "insvar", "killvar", "copyarr", "movearr", "sortarr", "scanstr", "unpackarr",
        "opengame", "savegame", "openqst", "inclib", "freelib", "refint",
        "showacts", "showinput", "showobjs", "showstat",
    ].join("|");

    const controls = [
        "act", "if", "elseif", "else", "loop", "while", "step", "end",
    ].join("|");

    const functions = [
        "desc", "max", "min", "rand", "rnd", "val", "iif", "dyneval", "func",
        "input", "usrtxt", "user_text", "maintxt", "stattxt",
        "getobj", "countobj", "selobj", "curloc", "curobjs", "selact", "curacts",
        "arrsize", "arrtype", "arrkey", "arritem", "arrpack", "arrpos", "arrcomp",
        "strcomp", "strfind", "strpos", "instr", "isnum",
        "trim", "ucase", "lcase", "len", "mid", "replace", "str",
        "isplay", "rgb", "msecscount", "qspver",
    ].join("|");

    // Core QSP system-variable names; DISABLESUBEX is retained for legacy code.
    // Prefix highlighting is lexical, not a check of the variable's runtime type.
    const systemVars = [
        "counter", "ongload", "ongsave", "onnewloc", "onactsel", "onobjsel", "onobjadd", "onobjdel",
        "usercom", "fname", "backimage", "args", "result",
        "nosave", "disablescroll", "disablesubex", "debug", "usehtml",
        "bcolor", "fcolor", "lcolor", "fsize",
    ].join("|");

    // QSP names accept non-delimiter characters from any alphabet. A dot separates
    // record fields, but remains part of a user-call location name.
    const delimiterChars = "\\s&'\"(){}\\[\\],:=!<>+\\-/*\\\\;^@?";
    const nameChar = `[^${delimiterChars}.]`;
    const nameStart = `[^${delimiterChars}.0-9#$%]`;
    const typePrefix = "[#$%]";
    const namedToken = (pattern: string) => ({
        pattern: RegExp(`(^|[${delimiterChars}.])(?:${pattern})(?!${nameChar})`, "i"),
        lookbehind: true,
    });

    const stringPat = `"(?:[^"]|"")*"|'(?:[^']|'')*'`;

    const interpolatedString = (quote: string) => {
        // Nested literals use the opposite quote style. The trailing guard keeps
        // a doubled escape from being backtracked into a premature closing quote.
        const innerQuote = quote === '"' ? "'" : '"';
        const literal = `${innerQuote}(?:[^${innerQuote}]|${innerQuote}${innerQuote})*${innerQuote}(?!${innerQuote})`;
        return {
            pattern: RegExp(`${quote}(?:[^${quote}]|${quote}${quote})*${quote}`),
            greedy: true,
            inside: {
                "interpolation": {
                    // Neither a quoted >> nor the outer string's closing quote
                    // can terminate a complete interpolation candidate.
                    pattern: RegExp(`<<(?:(?!>>)[^"']|${literal})*>>`),
                    greedy: true,
                    inside: {
                        "interpolation-punctuation": {
                            pattern: /^<<|>>$/,
                            alias: "punctuation",
                        },
                    },
                },
            },
        };
    };

    const balanced = (open: string, close: string, atom: string, depth = 20): string => {
        // inner = последовательность из атомов и вложенных сбалансированных групп,
        // глубина вложенности ограничена depth.
        let inner = `(?:${atom})*`;
        for (let i = 0; i < depth; i++) {
            inner = `(?:${atom}|\\${open}${inner}\\${close})*`;
        }
        return `\\${open}${inner}\\${close}`;
    };

    const codeBlockBalanced = balanced("{", "}", `[^{}"'!]|${stringPat}|![^\\n\\r]*`, 20);
    const tupleBalanced = balanced("[", "]", `[^\\[\\]"'!]|${stringPat}|![^\\n\\r]*`, 20);
    // Keep labels on one physical line; quotes/braces can protect an ampersand.
    const labelString = `"(?:[^"\\r\\n]|"")*"|'(?:[^'\\r\\n]|'')*'`;
    const labelBraces = balanced("{", "}", `[^{}"'\\r\\n]|${labelString}`, 20);

    const qsp: any = {
        "start-location": {
            // Require horizontal whitespace and a nonempty name on the same line.
            pattern: /^[ \t]*#[ \t]+\S.*$/m,
            greedy: true,
        },
        "end-location": {
            pattern: /^[ \t]*--.*$/m,
            greedy: true,
        },
        "label": {
            pattern: RegExp(`(^|[&:{])[ \\t]*:(?:[^&\\r\\n"'{}]|${labelString}|${labelBraces})*`, "m"),
            lookbehind: true,
            greedy: true,
        },
        // Reading view: простой однострочный комментарий. Многострочные комментарии
        // с чередованием блоков (" → { → ' → ") обрабатываются сканером в редакторе
        // (qspHighlighter.ts), т.к. регулярные выражения Prism не могут отслеживать
        // состояние вложенности блоков.
        "comment": {
            pattern: /(^[ \t]*|[&:][ \t]*)!.*/m,
            lookbehind: true,
            greedy: true,
        },
        "string": [interpolatedString('"'), interpolatedString("'")],
        "code-block": {
            pattern: new RegExp(codeBlockBalanced),
            greedy: true,
            alias: "punctuation",
            inside: {} as any,
        },
        "tuple": {
            pattern: new RegExp(tupleBalanced),
            greedy: true,
            alias: "punctuation",
            inside: {} as any,
        },
        "user-call": {
            pattern: RegExp(`@@?\\s*[^${delimiterChars}]+`, "i"),
            greedy: true,
        },
        "builtin": namedToken(`${typePrefix}?(?:${functions})`),
        "sys-variable": namedToken(`${typePrefix}?(?:${systemVars})`),
        "keyword": [
            namedToken("else\\s+if"),
            namedToken(`${controls}|${statements}`),
        ],
        "declarator": namedToken("local|set|let|alias"),
        "operator": [
            /<=|>=|<>|=<|=>|\+=|-=|\*=|\/=|[+\-*/=<>!&]/,
            namedToken("and|or|mod|no|obj|loc"),
        ],
        "number": [namedToken("\\d+"), /\?/],
        "sign-punctuation": /[{}[\]();,:.]/,
        "user-variable": namedToken(`${typePrefix}?${nameStart}${nameChar}*`),
    };

    const inner = { ...qsp } as any;
    delete inner["code-block"];
    delete inner["tuple"];

    for (const string of qsp["string"]) {
        string.inside["interpolation"].inside.rest = inner;
    }
    qsp["code-block"].inside = inner;
    qsp["tuple"].inside = inner;

    Prism.languages.qsp = qsp;
};

const loadPrismWithQsp = async () => {
    try {
        const Prism = await loadPrism();
        applyPrismQsp(Prism);
        return Prism;
    } catch (error) {
        console.error("Failed to load Prism:", error);
        throw error;
    }
};

export default loadPrismWithQsp;
