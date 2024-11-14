import { Decoration, DecorationSet, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from '@codemirror/state'
import loadPrismWithQsp from "loadPrismWithQsp";

export default class QspHighlight implements PluginValue {
    decorations: DecorationSet;
    prism: any;

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        this.loadPrism().then(() => {
            this.decorations = this.buildDecorations(view);
            view.update([]);
        });
    }

    update(update: ViewUpdate): void {
        if (update.viewportChanged || update.docChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    async loadPrism() {
        this.prism = await loadPrismWithQsp();
    }

    buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();

        if (!this.prism) {
            return Decoration.none;
        }

        const text = view.state.doc.toString(); // текст всего документа
        const regex = /```qsp(?:[\s:!?.;,@%&(){}[\]<>*~]*)([\s\S]*?)\n(>\s*)*?```/gi // qsp code block

        let match;
        while ((match = regex.exec(text)) !== null) {
            const codeBlock = match[0];
            const highlighted = this.prism.highlight(codeBlock, this.prism.languages.qsp, "qsp");

            const blockStart = match.index; // Вычисление начального индекса внутри блока кода
            this.applyHighlighting(highlighted, blockStart, builder);
        }

        return builder.finish();
    }

    applyHighlighting(highlighted: string, blockStart: number, builder: RangeSetBuilder<Decoration>) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(highlighted, "text/html");
        const tempEl = doc.body;

        let currentIndex = blockStart;

        const ranges: { start: number, end: number, className: string }[] = [];

        const traverse = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || '';
                currentIndex += text.length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                const className = element.className;

                // child Добавляйте классы стилей по диапазону путем обхода
                const start = currentIndex;
                element.childNodes.forEach((child) => {
                    traverse(child);
                });

                const end = currentIndex;

                ranges.push({ start, end, className });
            }
        };

        tempEl.childNodes.forEach((child) => {
            traverse(child);
        });

        // Сортируйте диапазон по начальному индексу, поскольку он должен применяться к builder по порядку.
        ranges.sort((a, b) => a.start - b.start);

        // Построить в соответствии с заказанным стилем
        for (const range of ranges) {
            builder.add(
                range.start,
                range.end,
                Decoration.mark({ class: range.className })
            );
        }
    }
}
