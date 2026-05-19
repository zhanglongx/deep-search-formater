import { MarkdownView, Notice, Plugin } from "obsidian";

import {
  type NormalizeResult,
  normalizeDeepResearchMarkdown,
} from "./normalizer";

const CURRENT_NOTE_COMMAND_ID = "normalize-current-note";
const CURRENT_NOTE_COMMAND_NAME = "清理当前笔记中的 Deep Research 标记";
const SELECTION_COMMAND_ID = "normalize-selection";
const SELECTION_COMMAND_NAME = "清理当前选区中的 Deep Research 标记";

export default class DeepResearchFormatterPlugin extends Plugin {
  async onload(): Promise<void> {
    this.addCommand({
      id: CURRENT_NOTE_COMMAND_ID,
      name: CURRENT_NOTE_COMMAND_NAME,
      callback: () => {
        this.normalizeCurrentNote();
      },
    });

    this.addCommand({
      id: SELECTION_COMMAND_ID,
      name: SELECTION_COMMAND_NAME,
      callback: () => {
        this.normalizeSelection();
      },
    });
  }

  private normalizeCurrentNote(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;

    if (!view || !editor) {
      new Notice("当前没有可编辑的 Markdown 笔记。");
      return;
    }

    const original = editor.getValue();
    const result = normalizeDeepResearchMarkdown(original);

    if (result.text === original) {
      new Notice("未发现 Deep Research 标记。");
      return;
    }

    editor.setValue(result.text);
    this.showResultNotice(result);
  }

  private normalizeSelection(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;

    if (!view || !editor) {
      new Notice("当前没有可编辑的 Markdown 笔记。");
      return;
    }

    const selection = editor.getSelection();
    if (!selection) {
      new Notice("请先选中需要清理的内容。");
      return;
    }

    const result = normalizeDeepResearchMarkdown(selection);
    if (result.text === selection) {
      new Notice("选区中未发现 Deep Research 标记。");
      return;
    }

    editor.replaceSelection(result.text);
    this.showResultNotice(result);
  }

  private showResultNotice(result: NormalizeResult): void {
    const parts: string[] = [];
    if (result.stats.citeRemoved > 0) {
      parts.push(`删除 ${result.stats.citeRemoved} 个 cite`);
    }
    if (result.stats.entityReplaced > 0) {
      parts.push(`替换 ${result.stats.entityReplaced} 个 entity`);
    }
    if (result.stats.urlReplaced > 0) {
      parts.push(`替换 ${result.stats.urlReplaced} 个 url`);
    }
    if (result.stats.unknownRemoved > 0) {
      parts.push(`移除 ${result.stats.unknownRemoved} 个未知标记`);
    }
    if (result.stats.parseErrors > 0) {
      parts.push(`${result.stats.parseErrors} 个 entity 解析回退`);
    }

    const message =
      parts.length > 0 ? parts.join("，") : "已完成 Deep Research 标记清理。";
    new Notice(message);
  }
}
