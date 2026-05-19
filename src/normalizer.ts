const TOKEN_START = "\uE200";
const TOKEN_PART = "\uE202";
const TOKEN_END = "\uE201";
const FRONTMATTER_DELIMITER = "---";

export interface NormalizeStats {
  citeRemoved: number;
  entityReplaced: number;
  urlReplaced: number;
  unknownRemoved: number;
  parseErrors: number;
}

export interface NormalizeResult {
  text: string;
  stats: NormalizeStats;
}

export function createEmptyStats(): NormalizeStats {
  return {
    citeRemoved: 0,
    entityReplaced: 0,
    urlReplaced: 0,
    unknownRemoved: 0,
    parseErrors: 0,
  };
}

export function normalizeDeepResearchMarkdown(input: string): NormalizeResult {
  const lineEnding = detectLineEnding(input);
  const lines = input.split(/\r?\n/u);
  const stats = createEmptyStats();
  const frontmatterEndLine = findFrontmatterEndLine(lines);
  const normalizedLines: string[] = [];
  let inFence = false;
  let activeFenceMarker = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (frontmatterEndLine !== -1 && index <= frontmatterEndLine) {
      normalizedLines.push(line);
      continue;
    }

    if (inFence) {
      normalizedLines.push(line);
      if (isFenceBoundary(line, activeFenceMarker)) {
        inFence = false;
        activeFenceMarker = "";
      }
      continue;
    }

    const nextFenceMarker = getFenceMarker(line);
    if (nextFenceMarker) {
      normalizedLines.push(line);
      inFence = true;
      activeFenceMarker = nextFenceMarker;
      continue;
    }

    normalizedLines.push(normalizeInlineContent(line, stats));
  }

  const collapsedLines = collapseBlankLines(normalizedLines, frontmatterEndLine);

  return {
    text: collapsedLines.join(lineEnding),
    stats,
  };
}

export function hasDeepResearchMarkers(input: string): boolean {
  return input.includes(TOKEN_START) && input.includes(TOKEN_END);
}

function detectLineEnding(input: string): string {
  return input.includes("\r\n") ? "\r\n" : "\n";
}

function findFrontmatterEndLine(lines: string[]): number {
  if (lines.length < 3 || lines[0].trim() !== FRONTMATTER_DELIMITER) {
    return -1;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === FRONTMATTER_DELIMITER || line === "...") {
      return index;
    }
  }

  return -1;
}

function getFenceMarker(line: string): string | null {
  const match = line.match(/^[ ]{0,3}(```+|~~~+)/u);
  if (!match) {
    return null;
  }

  return match[1][0];
}

function isFenceBoundary(line: string, activeMarker: string): boolean {
  const pattern = activeMarker === "`" ? /^[ ]{0,3}```+/u : /^[ ]{0,3}~~~+/u;
  return pattern.test(line);
}

function normalizeInlineContent(line: string, stats: NormalizeStats): string {
  let output = "";

  for (let index = 0; index < line.length; ) {
    if (line[index] === "`") {
      const backtickRunLength = countRepeatedCharacters(line, index, "`");
      const delimiter = "`".repeat(backtickRunLength);
      const closingIndex = line.indexOf(delimiter, index + backtickRunLength);

      if (closingIndex === -1) {
        output += line.slice(index);
        break;
      }

      output += line.slice(index, closingIndex + backtickRunLength);
      index = closingIndex + backtickRunLength;
      continue;
    }

    if (line[index] !== TOKEN_START) {
      output += line[index];
      index += 1;
      continue;
    }

    const closingIndex = line.indexOf(TOKEN_END, index + 1);
    if (closingIndex === -1) {
      output += line.slice(index);
      break;
    }

    const token = line.slice(index, closingIndex + 1);
    output += normalizeToken(token, stats);
    index = closingIndex + 1;
  }

  return cleanupLineWhitespace(output, line);
}

function countRepeatedCharacters(input: string, startIndex: number, character: string): number {
  let index = startIndex;
  while (input[index] === character) {
    index += 1;
  }
  return index - startIndex;
}

function normalizeToken(token: string, stats: NormalizeStats): string {
  const tokenBody = token.slice(TOKEN_START.length, token.length - TOKEN_END.length);
  const parts = tokenBody.split(TOKEN_PART);
  const tag = parts[0]?.trim();
  const payloads = parts.slice(1);

  switch (tag) {
    case "cite":
      stats.citeRemoved += 1;
      return "";
    case "entity":
      return replaceEntityToken(payloads, stats);
    case "url":
      return replaceUrlToken(payloads, stats);
    default:
      return replaceUnknownToken(payloads, stats);
  }
}

function replaceEntityToken(payloads: string[], stats: NormalizeStats): string {
  const replacement = extractEntityText(payloads[0], stats);
  if (replacement) {
    stats.entityReplaced += 1;
    return replacement;
  }

  stats.unknownRemoved += 1;
  return "";
}

function replaceUrlToken(payloads: string[], stats: NormalizeStats): string {
  const replacement = firstReadablePayload(payloads);
  if (replacement) {
    stats.urlReplaced += 1;
    return replacement;
  }

  stats.unknownRemoved += 1;
  return "";
}

function replaceUnknownToken(payloads: string[], stats: NormalizeStats): string {
  const replacement = firstReadablePayload(payloads);
  if (replacement) {
    return replacement;
  }

  stats.unknownRemoved += 1;
  return "";
}

function extractEntityText(payload: string | undefined, stats: NormalizeStats): string {
  if (!payload) {
    return "";
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (Array.isArray(parsed)) {
      const preferred = parsed[1];
      if (typeof preferred === "string" && preferred.trim()) {
        return preferred.trim();
      }

      const fallback = parsed.find(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      return fallback?.trim() ?? "";
    }
  } catch {
    stats.parseErrors += 1;
  }

  const quotedStrings = [...payload.matchAll(/"([^"]+)"/gu)].map((match) => match[1].trim());
  if (quotedStrings.length >= 2 && quotedStrings[1]) {
    return quotedStrings[1];
  }

  return quotedStrings.find((value) => value.length > 0) ?? "";
}

function firstReadablePayload(payloads: string[]): string {
  for (const payload of payloads) {
    const trimmed = payload.trim();
    if (!trimmed || isReferenceIdentifier(trimmed)) {
      continue;
    }

    const jsonLikeText = extractJsonLikeReadableText(trimmed);
    if (jsonLikeText) {
      return jsonLikeText;
    }

    return trimmed;
  }

  return "";
}

function extractJsonLikeReadableText(input: string): string {
  if (!(input.startsWith("[") && input.endsWith("]"))) {
    return "";
  }

  const matches = [...input.matchAll(/"([^"]+)"/gu)].map((match) => match[1].trim());
  if (matches.length >= 2 && matches[1]) {
    return matches[1];
  }

  return matches.find((value) => value.length > 0) ?? "";
}

function isReferenceIdentifier(input: string): boolean {
  return /^turn\d+[a-z]+\d+$/iu.test(input);
}

function cleanupLineWhitespace(line: string, originalLine: string): string {
  if (line === originalLine) {
    return line;
  }

  let cleaned = line
    .replace(/[ \t]+$/u, "")
    .replace(/[ \t]+([，。！？；：,.!?;:%)\]】》」])/gu, "$1")
    .replace(/([（([{【《「])[ \t]+/gu, "$1")
    .replace(/(\S)[ \t]{2,}(\S)/gu, "$1 $2");

  if (cleaned.trim().length === 0) {
    cleaned = "";
  }

  return cleaned;
}

function collapseBlankLines(lines: string[], frontmatterEndLine: number): string[] {
  const output: string[] = [];
  let inFence = false;
  let activeFenceMarker = "";
  let blankLineCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (frontmatterEndLine !== -1 && index <= frontmatterEndLine) {
      output.push(line);
      continue;
    }

    if (inFence) {
      output.push(line);
      if (isFenceBoundary(line, activeFenceMarker)) {
        inFence = false;
        activeFenceMarker = "";
      }
      continue;
    }

    const nextFenceMarker = getFenceMarker(line);
    if (nextFenceMarker) {
      blankLineCount = 0;
      output.push(line);
      inFence = true;
      activeFenceMarker = nextFenceMarker;
      continue;
    }

    if (line.trim().length === 0) {
      if (blankLineCount < 2) {
        output.push("");
      }
      blankLineCount += 1;
      continue;
    }

    blankLineCount = 0;
    output.push(line);
  }

  return output;
}
