/* eslint-disable no-useless-escape */
import { loadPrism } from "obsidian";

const applyPrismQsp = (Prism: any) => {
    const kw_operators = '\\b(inclib|freelib|addqst|killqst|openqst|opengame|savegame|addobj|delobj|killobj|unsel|unselect|cls|cla|delact|cmdclr|cmdclear|play|close|all|jump|dynamic|goto|gt|xgoto|xgt|gosub|gs|menu|exit|showobjs|showstat|showacts|showinput|refint|copyarr|killvar|killall|view|msg|settimer|wait|exec)\\b'
    const kw_controls = '\\b(act|if|elseif|else|loop|while|step|end)\\b'
    const kw_text_operators = '\\*?\\b(pl?|nl|clr|clear)\\b'

    const functions_string = '\\$(desc|user_text|usrtxt|maintxt|stattxt|curloc|selobj|selact|mid|(u|l)case|trim|replace|str|strfind|input|qspver|curacts|getobj|iif|dyneval|func|max|min|arritem)\\b'
    const functions_num = '\\b(loc|obj|isnum|isplay|len|val|instr|strcomp|strpos|arrsize|arrpos|arrcomp|msecscount|rgb|countobj|ra?nd|iif|dyneval|func|max|min|arritem)\\b'

    const system_vars_string = '\\$(counter|ongload|ongsave|onnewloc|onactsel|onobjsel|onobjadd|onobjdel|usercom|fname|backimage|args|result)\\b'
    const system_vars_num = '\\b(nosave|disablescroll|disablesubex|debug|usehtml|(b|f|l)color|fsize|args|result)\\b'

    Prism.languages.qsp = {
        'comment': {
            pattern: /((^\s*?)|(\&\s*?))(![^\n{'"]*$)/m,
            lookbehind: true,
            greedy: true,
        },
        'braced-comment': {
            pattern: /((^\s*?)|(\&\s*?))(![^\n{'"]*\{[^\}]*\}.*?$)/m,
            alias: 'comment',
            lookbehind: true,
            greedy: true,
        },
        'quoted-comment': {
            pattern: /((^\s*?)|(\&\s*?))((![^\n{'"]*"[^"]*".*?$)|(![^'\n\r]*'[^']*?'.*?$))/m,
            alias: 'comment',
            lookbehind: true,
            greedy: true,
        },
        'string': {
            pattern: /("|')(?:[\s\S]*?)\1/im,
            lookbehind: false,
            greedy: true
        },
        'function': {
            pattern: /\@[\w\.а-я]+(?=\s*\()/i,
        },
        'start-location': /^\#\s*\S+.*$/im,
        'end-location': /^\-.*$/im,
        'label': {
            pattern: /^\s*:[^&\n]*(?=\&|$)/im,
            lookbehind: true,
            greedy: true,
        },
        'sys-variable': RegExp(`(?:${system_vars_string}|${system_vars_num})`, 'i'),
        'builtin': RegExp(`(?:(${functions_string}|${functions_num}))`, 'i'),
        'number': /\b\d+\b/,
        'keyword': RegExp(`(?:${kw_text_operators}|${kw_operators}|${kw_controls})`, 'i'),
        'declarator': /(?:\b(local|set|let)\b)/i,
        'operator': /[<>\+\-\*\/]=|<>|\+|\&|-|<|>|=|\/|\*|!|\b(and|or|mod|no)\b/i,
        'sign-punctuation': /[{}[\];(),:]/,
        'user-variable': /[\$\%][\wа-я]+|[\wа-я]+/i,
    };
}

const loadPrismWithQsp = async () => {
    try {
        const Prism = await loadPrism();
        applyPrismQsp(Prism);
        return Prism;
    } catch (error) {
        console.error("Failed to load Prism:", error);
        throw error;
    }
}

export default loadPrismWithQsp;