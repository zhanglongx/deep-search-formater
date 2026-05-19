import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli";

const TOKEN_START = "\uE200";
const TOKEN_PART = "\uE202";
const TOKEN_END = "\uE201";

class MemoryWriter {
  chunks: string[] = [];

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  toString(): string {
    return this.chunks.join("");
  }
}

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("runCli", () => {
  it("formats Markdown recursively and skips ignored paths", async () => {
    const workspace = await createTempWorkspace();
    const nestedDir = join(workspace, "notes", "daily");
    const skippedDir = join(workspace, ".obsidian", "plugins");
    const ignoredFile = join(workspace, "raw.txt");
    const changedFile = join(nestedDir, "changed.md");
    const unchangedFile = join(workspace, "notes", "unchanged.md");
    const skippedFile = join(skippedDir, "skipped.md");

    await mkdir(nestedDir, { recursive: true });
    await mkdir(skippedDir, { recursive: true });
    await writeFile(
      changedFile,
      `正文 ${wrapToken("cite", "turn1view0")}\n另见 ${wrapToken("url", "Example label", "turn2search0")}。\n`,
      "utf8",
    );
    await writeFile(unchangedFile, "纯文本内容。\n", "utf8");
    await writeFile(skippedFile, `隐藏目录 ${wrapToken("cite", "turn3view0")}\n`, "utf8");
    await writeFile(ignoredFile, `不是 Markdown ${wrapToken("cite", "turn4view0")}\n`, "utf8");

    const beforeStat = await stat(unchangedFile);
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();

    const exitCode = await runCli([workspace], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(await readFile(changedFile, "utf8")).toBe("正文\n另见 Example label。\n");
    expect(await readFile(unchangedFile, "utf8")).toBe("纯文本内容。\n");
    expect(await readFile(skippedFile, "utf8")).toBe(`隐藏目录 ${wrapToken("cite", "turn3view0")}\n`);
    expect(await readFile(ignoredFile, "utf8")).toBe(`不是 Markdown ${wrapToken("cite", "turn4view0")}\n`);
    expect((await stat(unchangedFile)).mtimeMs).toBe(beforeStat.mtimeMs);
    expect(stdout.toString()).toContain("Scanned 2 Markdown file(s); updated 1; unchanged 1; failed 0.");
    expect(stdout.toString()).toContain("removed 1 cite");
    expect(stdout.toString()).toContain("replaced 1 url");
  });

  it("supports targeting an explicit subdirectory", async () => {
    const workspace = await createTempWorkspace();
    const rootFile = join(workspace, "root.md");
    const targetDir = join(workspace, "selected");
    const targetFile = join(targetDir, "target.md");

    await mkdir(targetDir, { recursive: true });
    await writeFile(rootFile, `根目录 ${wrapToken("cite", "turn1view0")}\n`, "utf8");
    await writeFile(targetFile, `子目录 ${wrapToken("cite", "turn2view0")}\n`, "utf8");

    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const exitCode = await runCli([targetDir], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(await readFile(rootFile, "utf8")).toBe(`根目录 ${wrapToken("cite", "turn1view0")}\n`);
    expect(await readFile(targetFile, "utf8")).toBe("子目录\n");
    expect(stdout.toString()).toContain(`Formatted directory: ${targetDir}`);
    expect(stdout.toString()).toContain("Scanned 1 Markdown file(s); updated 1; unchanged 0; failed 0.");
  });

  it("returns a usage error for a missing directory", async () => {
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const exitCode = await runCli(["/path/that/does/not/exist"], { stdout, stderr });

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toContain("Target directory not found");
  });

  it("continues after a file write failure and returns a non-zero exit code", async () => {
    const workspace = await createTempWorkspace();
    const okFile = join(workspace, "ok.md");
    const blockedFile = join(workspace, "blocked.md");

    await writeFile(okFile, `可写文件 ${wrapToken("cite", "turn1view0")}\n`, "utf8");
    await writeFile(blockedFile, `受限文件 ${wrapToken("cite", "turn2view0")}\n`, "utf8");
    await chmod(blockedFile, 0o400);

    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();

    try {
      const exitCode = await runCli([workspace], { stdout, stderr });

      expect(exitCode).toBe(2);
      expect(await readFile(okFile, "utf8")).toBe("可写文件\n");
      expect(await readFile(blockedFile, "utf8")).toBe(`受限文件 ${wrapToken("cite", "turn2view0")}\n`);
      expect(stdout.toString()).toContain("Scanned 2 Markdown file(s); updated 1; unchanged 0; failed 1.");
      expect(stderr.toString()).toContain("Failures:");
      expect(stderr.toString()).toContain(blockedFile);
    } finally {
      await chmod(blockedFile, 0o600);
    }
  });
});

async function createTempWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "deep-research-formatter-"));
  tempDirectories.push(directory);
  return directory;
}

function wrapToken(tag: string, ...payloads: string[]): string {
  return `${TOKEN_START}${tag}${payloads.map((payload) => `${TOKEN_PART}${payload}`).join("")}${TOKEN_END}`;
}
