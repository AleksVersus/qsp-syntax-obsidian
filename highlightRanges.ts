export interface HighlightRange {
    start: number;
    end: number;
    className: string;
}

export function collectHighlightRanges(
    highlighted: string,
    blockStart: number,
    ranges: HighlightRange[]
): void {
    const parser = new DOMParser();
    // An explicit body preserves whitespace before the first highlighted token.
    const doc = parser.parseFromString(`<body>${highlighted}</body>`, "text/html");
    let currentIndex = blockStart;

    const traverse = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            currentIndex += (node.textContent || "").length;
            return;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const start = currentIndex;
            element.childNodes.forEach((child) => traverse(child));
            const end = currentIndex;
            if (element.className) {
                ranges.push({ start, end, className: element.className });
            }
        }
    };

    doc.body.childNodes.forEach((child) => traverse(child));
}
