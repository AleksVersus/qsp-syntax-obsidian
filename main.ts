import { Plugin } from 'obsidian';
import { ViewPlugin } from '@codemirror/view';
import loadPrismWithQsp from 'loadPrismWithQsp';
import QspHighlight from 'qspHighlighter';
import { CommentScanner } from './commentScanner';

const escapeHtml = (text: string): string =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

export default class QspSyntaxHighlightingPlugin extends Plugin {
	private prism: any | null = null;
	private prismPromise: Promise<any | null> | null = null;
	private scanner: CommentScanner | null = null;

	async onload() {
		this.prismPromise = this.getPrism();
		this.scanner = new CommentScanner();

		this.registerMarkdownCodeBlockProcessor('qsp', async (source, el) => {
			const code = el.createEl('pre').createEl('code', {
				cls: 'language-qsp',
			});

			const prism = await this.prismPromise;
			if (!prism?.languages?.qsp) {
				code.textContent = source;
				return;
			}

			const regions = this.scanner!.scan(source);
			const parts: string[] = [];

			for (const region of regions) {
				if (region.type === 'comment') {
					parts.push(`<span class="token comment">${escapeHtml(region.text)}</span>`);
				} else {
					parts.push(prism.highlight(region.text, prism.languages.qsp, 'qsp'));
				}
			}

			code.innerHTML = parts.join('');
		});

		this.registerEditorExtension(
			ViewPlugin.fromClass(QspHighlight, {
				decorations: (plugin) => plugin.decorations,
			})
		);

		this.app.workspace.updateOptions();
	}

	private async getPrism(): Promise<any | null> {
		if (this.prism) {
			return this.prism;
		}
		if (this.prismPromise) {
			// Allow concurrent callers while first load is in progress.
		}
		try {
			this.prism = await loadPrismWithQsp();
			return this.prism;
		} catch (error) {
			console.error('Failed to load Prism for QSP syntax highlighting:', error);
			this.prism = null;
			return null;
		}
	}

	onunload() {
		if (this.prism?.languages?.qsp) {
			delete this.prism.languages.qsp;
		}
		this.prism = null;
		this.prismPromise = null;
		this.scanner = null;
	}
}
