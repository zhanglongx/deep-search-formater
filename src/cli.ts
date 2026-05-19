import type { Dirent } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import process from "node:process";

import {
  createEmptyStats,
  type NormalizeStats,
  normalizeDeepResearchMarkdown,
} from "./normalizer";

const HELP_FLAGS = new Set(["-h", "--help"]);
const SKIPPED_DIRECTORY_NAMES = new Set([".git", ".obsidian", "node_modules"]);

interface CliWriter {
  write(chunk: string): unknown;
}

export interface FormatFailure {
  path: string;
  error: string;
}

export interface FormatDirectorySummary {
  targetDir: string;
  scannedFiles: number;
  updatedFiles: number;
  unchangedFiles: number;
  failedFiles: number;
  stats: NormalizeStats;
  failures: FormatFailure[];
}

export interface RunCliOptions {
  cwd?: string;
  stdout?: CliWriter;
  stderr?: CliWriter;
}

export async function formatMarkdownDirectory(targetDir: string): Promise<FormatDirectorySummary> {
  const resolvedTargetDir = resolve(targetDir);
  const summary: FormatDirectorySummary = {
    targetDir: resolvedTargetDir,
    scannedFiles: 0,
    updatedFiles: 0,
    unchangedFiles: 0,
    failedFiles: 0,
    stats: createEmptyStats(),
    failures: [],
  };

  await walkDirectory(resolvedTargetDir, summary);
  return summary;
}

export async function runCli(
  args: string[],
  options: RunCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const cwd = options.cwd ?? process.cwd();

  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    stdout.write(getUsageText());
    return 0;
  }

  if (args.length !== 1) {
    stderr.write(getUsageText());
    return 1;
  }

  const targetDir = resolve(cwd, args[0]);
  const targetStat = await getDirectoryStat(targetDir);

  if (targetStat === null) {
    stderr.write(`Target directory not found: ${targetDir}\n`);
    return 1;
  }

  if (!targetStat.isDirectory()) {
    stderr.write(`Target path is not a directory: ${targetDir}\n`);
    return 1;
  }

  const summary = await formatMarkdownDirectory(targetDir);
  stdout.write(formatSummary(summary));

  if (summary.failures.length > 0) {
    stderr.write(formatFailures(summary.failures));
    return 2;
  }

  return 0;
}

async function walkDirectory(
  directoryPath: string,
  summary: FormatDirectorySummary,
): Promise<void> {
  let entries: Dirent<string>[];

  try {
    entries = await readdir(directoryPath, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    pushFailure(summary, directoryPath, error);
    return;
  }

  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      await walkDirectory(entryPath, summary);
      continue;
    }

    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") {
      continue;
    }

    summary.scannedFiles += 1;

    try {
      const original = await readFile(entryPath, "utf8");
      const result = normalizeDeepResearchMarkdown(original);
      mergeStats(summary.stats, result.stats);

      if (result.text === original) {
        summary.unchangedFiles += 1;
        continue;
      }

      await writeFile(entryPath, result.text, "utf8");
      summary.updatedFiles += 1;
    } catch (error) {
      pushFailure(summary, entryPath, error);
    }
  }
}

async function getDirectoryStat(targetDir: string) {
  try {
    return await stat(targetDir);
  } catch {
    return null;
  }
}

function mergeStats(target: NormalizeStats, source: NormalizeStats): void {
  target.citeRemoved += source.citeRemoved;
  target.entityReplaced += source.entityReplaced;
  target.urlReplaced += source.urlReplaced;
  target.unknownRemoved += source.unknownRemoved;
  target.parseErrors += source.parseErrors;
}

function pushFailure(
  summary: FormatDirectorySummary,
  path: string,
  error: unknown,
): void {
  summary.failedFiles += 1;
  summary.failures.push({
    path,
    error: error instanceof Error ? error.message : String(error),
  });
}

function formatSummary(summary: FormatDirectorySummary): string {
  const lines = [
    `Formatted directory: ${summary.targetDir}`,
    `Scanned ${summary.scannedFiles} Markdown file(s); updated ${summary.updatedFiles}; unchanged ${summary.unchangedFiles}; failed ${summary.failedFiles}.`,
    `Markers: removed ${summary.stats.citeRemoved} cite, replaced ${summary.stats.entityReplaced} entity, replaced ${summary.stats.urlReplaced} url, removed ${summary.stats.unknownRemoved} unknown, parse fallbacks ${summary.stats.parseErrors}.`,
  ];

  return `${lines.join("\n")}\n`;
}

function formatFailures(failures: FormatFailure[]): string {
  const lines = ["Failures:"];

  for (const failure of failures) {
    lines.push(`- ${failure.path}: ${failure.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function getUsageText(): string {
  return [
    "Usage: node dist/cli.js <target-dir>",
    "",
    "Recursively format Markdown files under <target-dir>.",
    "Skipped directories: .git, .obsidian, node_modules.",
  ].join("\n") + "\n";
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
