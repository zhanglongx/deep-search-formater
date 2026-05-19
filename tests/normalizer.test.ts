import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeDeepResearchMarkdown } from "../src/normalizer";

const TOKEN_START = "\uE200";
const TOKEN_PART = "\uE202";
const TOKEN_END = "\uE201";

describe("normalizeDeepResearchMarkdown", () => {
  it("removes cite markers and cleans punctuation spacing", () => {
    const input = `结论如下。 ${wrapToken("cite", "turn1view0", "turn2search0")}`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("结论如下。");
    expect(result.stats.citeRemoved).toBe(1);
  });

  it("keeps readable entity and url text", () => {
    const input =
      `标的是 ${wrapToken("entity", "[\"stock\",\"标普500指数\",\"S&P 500 stock market index\"]")}，另见 ${wrapToken("url", "Robert Shiller 在线数据页", "turn46search0")}。`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("标的是 标普500指数，另见 Robert Shiller 在线数据页。");
    expect(result.stats.entityReplaced).toBe(1);
    expect(result.stats.urlReplaced).toBe(1);
  });

  it("falls back safely for unknown tags and unreadable payloads", () => {
    const input =
      `A ${wrapToken("foo", "可读文字", "turn1view0")} B / C ${wrapToken("bar", "turn2search0")} D`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("A 可读文字 B / C D");
    expect(result.stats.unknownRemoved).toBe(1);
  });

  it("leaves frontmatter, fenced code blocks, and inline code untouched", () => {
    const input = [
      "---",
      "title: test",
      "---",
      "",
      `正文 ${wrapToken("cite", "turn1view0")}`,
      "",
      "```mermaid",
      `A[${wrapToken("cite", "turn2view0")}]`,
      "```",
      "",
      `\`内联 ${wrapToken("cite", "turn3view0")} code\``,
    ].join("\n");
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toContain("title: test");
    expect(result.text).toContain("正文");
    expect(result.text).toContain(`A[${wrapToken("cite", "turn2view0")}]`);
    expect(result.text).toContain(`\`内联 ${wrapToken("cite", "turn3view0")} code\``);
    expect(result.stats.citeRemoved).toBe(1);
  });

  it("leaves incomplete tokens unchanged", () => {
    const input = `片段 ${TOKEN_START}cite${TOKEN_PART}turn1view0`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe(input);
    expect(result.stats.citeRemoved).toBe(0);
  });

  it("normalizes a full example document without leaving markers behind", () => {
    const examplePath = resolve(
      process.cwd(),
      "tests",
      "fixtures",
      "deep-research-sample.md",
    );
    const example = readFileSync(examplePath, "utf8");
    const result = normalizeDeepResearchMarkdown(example);

    expect(result.text).not.toContain(TOKEN_START);
    expect(result.text).not.toContain(TOKEN_PART);
    expect(result.text).not.toContain(TOKEN_END);
    expect(result.text).toContain("标普500指数");
    expect(result.text).toContain("Robert Shiller 在线数据页");
    expect(result.text).toContain("Nasdaq-100 1Q2026 Fundamentals Update PDF");
    expect(result.text).toContain("```mermaid");
  });
});

function wrapToken(tag: string, ...payloads: string[]): string {
  return `${TOKEN_START}${tag}${payloads.map((payload) => `${TOKEN_PART}${payload}`).join("")}${TOKEN_END}`;
}
