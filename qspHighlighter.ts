import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import loadPrismWithQsp from "loadPrismWithQsp";
import { CommentScanner } from "./commentScanner";
import { collectHighlightRanges, type HighlightRange } from "./highlightRanges";

export default class QspHighlight implements PluginValue {
    decorations: DecorationSet;
    prism: any;
    private scanner: CommentScanner;

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        this.scanner = new CommentScanner();
        this.loadPrism().then(() => {
            this.decorations = this.buildDecorations(view);
            view.update([]);
        });
    }

    update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    async loadPrism() {
        this.prism = await loadPrismWithQsp();
    }

    buildDecorations(view: EditorView): DecorationSet {
        if (!this.prism?.languages?.qsp) {
            return Decoration.none;
        }

        const ranges: HighlightRange[] = [];

        syntaxTree(view.state).iterate({
            enter: (node) => {
                if (node.name !== "FencedCode") {
                    return;
                }

                let language = "";
                let contentFrom = -1;
                let contentTo = -1;

                const cursor = node.node.cursor();
                if (cursor.firstChild()) {
                    do {
                        if (cursor.name === "CodeInfo") {
                            language = view.state.sliceDoc(cursor.from, cursor.to).trim().toLowerCase();
                        } else if (cursor.name === "CodeText") {
                            if (contentFrom === -1) {
                                contentFrom = cursor.from;
                            }
                            contentTo = cursor.to;
                        }
                    } while (cursor.nextSibling());
                }

                if (!language.startsWith("qsp") || contentFrom === -1 || contentTo <= contentFrom) {
                    return;
                }

                const code = view.state.sliceDoc(contentFrom, contentTo);
                const regions = this.scanner.scan(code);

                for (const region of regions) {
                    const absStart = contentFrom + region.start;
                    const absEnd = absStart + region.text.length;

                    if (region.type === "comment") {
                        ranges.push({ start: absStart, end: absEnd, className: "token comment" });
                    } else {
                        const highlighted = this.prism.highlight(region.text, this.prism.languages.qsp, "qsp");
                        collectHighlightRanges(highlighted, absStart, ranges);
                    }
                }
            },
        });

        if (ranges.length === 0) {
            return Decoration.none;
        }

        ranges.sort((a, b) => a.start - b.start || a.end - b.end);
        const builder = new RangeSetBuilder<Decoration>();
        for (const range of ranges) {
            if (range.end > range.start && range.className) {
                builder.add(range.start, range.end, Decoration.mark({ class: range.className }));
            }
        }
        return builder.finish();
    }
}
