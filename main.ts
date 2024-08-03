import { Plugin } from 'obsidian';

import './mode/qsp/qsp-syntax'

export default class QspSyntaxHighlightPlugin extends Plugin {

  onload(): void { }

  onunload() {
    delete CodeMirror.modes["qsp"];
  }

}