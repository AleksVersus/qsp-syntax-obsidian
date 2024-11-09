import { Plugin } from 'obsidian';
import loadPrismWithQsp from 'loadPrismWithQsp';
import QspHighlight from 'qspHighlighter';
import { ViewPlugin } from '@codemirror/view';

export default class QspSyntaxHighlightingPlugin extends Plugin {
    obsidianPrism: any;

    async onload() {
        try {
            console.log('Loading Qsp Syntax Highlighting Plugin');
            this.obsidianPrism = await loadPrismWithQsp();

            // Настройка подсветки синтаксиса Qsp в режиме чтения
            this.registerMarkdownPostProcessor((el, ctx) => {
                el.querySelectorAll('pre > code.language-qsp').forEach((block) => {
                    this.obsidianPrism.highlightElement(block);
                });
            });

            // Настройка подсветки синтаксиса Qsp в режиме редактирования
            this.registerEditorExtension(
                ViewPlugin.fromClass(
                    QspHighlight, { 
                        decorations: (plugin) => plugin.decorations,
                    }
                )
            );

            this.app.workspace.updateOptions();

        } catch (error) {
            console.error('Failed to load Prism: ', error);
        }
    }

    onunload() {
        console.log('Unloading Qsp Syntax Highlighting Plugin');

        // Удалить синтаксис Qsp из Prism.js
        if (this.obsidianPrism && this.obsidianPrism.languages.qsp) {
            delete this.obsidianPrism.languages.qsp;
        }
    }
}