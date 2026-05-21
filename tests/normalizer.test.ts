import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createEmptyStats,
  normalizeDeepResearchMarkdown,
} from "../src/normalizer";

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

  it("removes full-width bracket citations and cleans punctuation spacing", () => {
    const input =
      `鱼跃2024年营收75.66亿元${wrapBracketCitation("4†L4331-L4334")}；2025年约79.55亿元${wrapBracketCitation("44†L33-L40")}。`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("鱼跃2024年营收75.66亿元；2025年约79.55亿元。");
    expect(result.stats.citeRemoved).toBe(2);
  });

  it("keeps readable entity and url text", () => {
    const input =
      `标的是 ${wrapToken("entity", "[\"stock\",\"标普500指数\",\"S&P 500 stock market index\"]")}，另见 ${wrapToken("url", "Robert Shiller 在线数据页", "turn46search0")}。`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("标的是 标普500指数，另见 Robert Shiller 在线数据页。");
    expect(result.stats.entityReplaced).toBe(1);
    expect(result.stats.urlReplaced).toBe(1);
  });

  it("cleans punctuation revealed at token boundaries for removed cites", () => {
    const input = `结论 ${wrapToken("cite", "turn1view0")} ，补充。 see ${wrapToken("cite", "turn2view0")} , note.`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("结论，补充。 see, note.");
    expect(result.stats.citeRemoved).toBe(2);
  });

  it("removes consecutive full-width bracket citations without leaving extra spaces", () => {
    const input =
      `来源${wrapBracketCitation("19†L68-L72")}${wrapBracketCitation("36†L413-L420")}；毛利率50%${wrapBracketCitation("4†L4331-L4334")}。`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("来源；毛利率50%。");
    expect(result.stats.citeRemoved).toBe(3);
  });

  it("cleans punctuation revealed at token boundaries for replacements", () => {
    const input =
      `标的是 ${wrapToken("entity", "[\"stock\",\"标普500指数\",\"S&P 500 stock market index\"]")} ，另见。`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("标的是 标普500指数，另见。");
    expect(result.stats.entityReplaced).toBe(1);
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
      `正文 ${wrapToken("cite", "turn1view0")} ${wrapBracketCitation("4†L4331-L4334")}`,
      "",
      "```mermaid",
      `A[${wrapToken("cite", "turn2view0")}]`,
      `B[${wrapBracketCitation("44†L33-L40")}]`,
      "```",
      "",
      `\`内联 ${wrapToken("cite", "turn3view0")} ${wrapBracketCitation("44†L33-L40")} code\``,
    ].join("\n");
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toContain("title: test");
    expect(result.text).toContain("正文");
    expect(result.text).toContain(`A[${wrapToken("cite", "turn2view0")}]`);
    expect(result.text).toContain(`B[${wrapBracketCitation("44†L33-L40")}]`);
    expect(result.text).toContain(
      `\`内联 ${wrapToken("cite", "turn3view0")} ${wrapBracketCitation("44†L33-L40")} code\``,
    );
    expect(result.stats.citeRemoved).toBe(2);
  });

  it("leaves incomplete tokens unchanged", () => {
    const input = `片段 ${TOKEN_START}cite${TOKEN_PART}turn1view0`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe(input);
    expect(result.stats.citeRemoved).toBe(0);
  });

  it("does not rewrite whitespace-only blank lines when no markers exist", () => {
    const input = [
      "# 标题",
      "第一段",
      "  ",
      "\t",
      "",
      "第二段包含 f( x ) 和 hello , world",
    ].join("\n");
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe(input);
    expect(result.stats).toEqual(createEmptyStats());
  });

  it("collapses blank runs created by removing cite-only lines", () => {
    const input = [
      "第一段",
      "",
      wrapToken("cite", "turn1view0"),
      "",
      "第二段",
    ].join("\n");
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe(["第一段", "", "第二段"].join("\n"));
    expect(result.stats.citeRemoved).toBe(1);
  });

  it("only cleans whitespace around token boundaries without tightening ASCII parentheses", () => {
    const input = `foo ${wrapToken("cite", "turn1view0")} f( x )`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("foo f( x )");
    expect(result.stats.citeRemoved).toBe(1);
  });

  it("collapses duplicated spaces created by removing a token inside ASCII parentheses", () => {
    const input = `f( ${wrapToken("cite", "turn1view0")} x )`;
    const result = normalizeDeepResearchMarkdown(input);

    expect(result.text).toBe("f( x )");
    expect(result.stats.citeRemoved).toBe(1);
  });

  it("leaves non-citation full-width brackets and incomplete bracket citations unchanged", () => {
    const input = [
      "普通说明【保守情景】保持原样。",
      "未闭合引用【4†L4331-L4334",
    ].join("\n");
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

function wrapBracketCitation(reference: string): string {
  return `【${reference}】`;
}
