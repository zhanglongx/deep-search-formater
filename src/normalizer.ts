const TOKEN_START = "\uE200";
const TOKEN_PART = "\uE202";
const TOKEN_END = "\uE201";
const TOKEN_BOUNDARY = "\uE203";
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

interface NormalizedLine {
  text: string;
  changed: boolean;
  blankKind: "nonblank" | "preserved" | "generated";
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
  const normalizedLines: NormalizedLine[] = [];
  let inFence = false;
  let activeFenceMarker = "";
  let hasChanges = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (frontmatterEndLine !== -1 && index <= frontmatterEndLine) {
      normalizedLines.push(createNormalizedLine(line, line));
      continue;
    }

    if (inFence) {
      normalizedLines.push(createNormalizedLine(line, line));
      if (isFenceBoundary(line, activeFenceMarker)) {
        inFence = false;
        activeFenceMarker = "";
      }
      continue;
    }

    const nextFenceMarker = getFenceMarker(line);
    if (nextFenceMarker) {
      normalizedLines.push(createNormalizedLine(line, line));
      inFence = true;
      activeFenceMarker = nextFenceMarker;
      continue;
    }

    const normalizedLine = normalizeInlineContent(line, stats);
    normalizedLines.push(normalizedLine);
    hasChanges ||= normalizedLine.changed;
  }

  if (!hasChanges) {
    return {
      text: input,
      stats,
    };
  }

  const collapsedLines = collapseBlankLines(normalizedLines, frontmatterEndLine);

  return {
    text: collapsedLines.join(lineEnding),
    stats,
  };
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

function createNormalizedLine(originalLine: string, text: string): NormalizedLine {
  const changed = text !== originalLine;

  if (text.trim().length > 0) {
    return {
      text,
      changed,
      blankKind: "nonblank",
    };
  }

  if (originalLine.trim().length === 0) {
    return {
      text: originalLine,
      changed,
      blankKind: "preserved",
    };
  }

  return {
    text: "",
    changed,
    blankKind: "generated",
  };
}

function normalizeInlineContent(line: string, stats: NormalizeStats): NormalizedLine {
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

    if (line[index] === "【") {
      const closingIndex = line.indexOf("】", index + 1);
      if (closingIndex !== -1) {
        const token = line.slice(index + 1, closingIndex);
        if (token.includes("†")) {
          output += `${TOKEN_BOUNDARY}${removeCiteMarker(stats)}${TOKEN_BOUNDARY}`;
          index = closingIndex + 1;
          continue;
        }
      }
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
    output += `${TOKEN_BOUNDARY}${normalizeToken(token, stats)}${TOKEN_BOUNDARY}`;
    index = closingIndex + 1;
  }

  return createNormalizedLine(line, cleanupTokenBoundaryWhitespace(output));
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
      return removeCiteMarker(stats);
    case "entity":
      return replaceEntityToken(payloads, stats);
    case "url":
      return replaceUrlToken(payloads, stats);
    default:
      return replaceUnknownToken(payloads, stats);
  }
}

function removeCiteMarker(stats: NormalizeStats): string {
  stats.citeRemoved += 1;
  return "";
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

function cleanupTokenBoundaryWhitespace(line: string): string {
  if (!line.includes(TOKEN_BOUNDARY)) {
    return line;
  }

  let cleaned = line
    .replace(/\uE203{2,}/gu, TOKEN_BOUNDARY)
    .replace(/\uE203[ \t]+$/u, TOKEN_BOUNDARY)
    .replace(/[ \t]+\uE203(?=$)/u, TOKEN_BOUNDARY)
    .replace(/[ \t]*\uE203[ \t]*(?=[，。！？；：,.!?;%）】》」])/gu, TOKEN_BOUNDARY)
    .replace(/[ \t]+\uE203[ \t]+/gu, ` ${TOKEN_BOUNDARY}`)
    .replace(/(?<=\S)\uE203[ \t]{2,}(?=\S)/gu, `${TOKEN_BOUNDARY} `)
    .replace(/(?<=\S)[ \t]{2,}\uE203(?=\S)/gu, ` ${TOKEN_BOUNDARY}`)
    .replace(/\uE203/gu, "");

  if (cleaned.trim().length === 0) {
    cleaned = "";
  }

  return cleaned;
}

function collapseBlankLines(lines: NormalizedLine[], frontmatterEndLine: number): string[] {
  const output: string[] = [];
  let inFence = false;
  let activeFenceMarker = "";
  let blankRun: NormalizedLine[] = [];

  const flushBlankRun = () => {
    if (blankRun.length === 0) {
      return;
    }

    const hasGeneratedBlank = blankRun.some((line) => line.blankKind === "generated");
    if (hasGeneratedBlank) {
      output.push("");
    } else {
      output.push(...blankRun.map((line) => line.text));
    }

    blankRun = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (frontmatterEndLine !== -1 && index <= frontmatterEndLine) {
      flushBlankRun();
      output.push(line.text);
      continue;
    }

    if (inFence) {
      flushBlankRun();
      output.push(line.text);
      if (isFenceBoundary(line.text, activeFenceMarker)) {
        inFence = false;
        activeFenceMarker = "";
      }
      continue;
    }

    const nextFenceMarker = getFenceMarker(line.text);
    if (nextFenceMarker) {
      flushBlankRun();
      output.push(line.text);
      inFence = true;
      activeFenceMarker = nextFenceMarker;
      continue;
    }

    if (line.text.trim().length === 0) {
      blankRun.push(line);
      continue;
    }

    flushBlankRun();
    output.push(line.text);
  }

  flushBlankRun();
  return output;
}
