# Deep Research Formatter

Deep Research Formatter is an Obsidian plugin for cleaning Markdown exported from ChatGPT Deep Research.

Deep Research exports often contain inline marker tokens such as citation, entity, and URL annotations that are readable inside ChatGPT but noisy in plain Markdown. This plugin removes or rewrites those markers so the document is easier to read in Obsidian.

## What it does

- Removes `cite` markers entirely.
- Replaces `entity` markers with their readable label.
- Replaces `url` markers with their readable label.
- Falls back safely for unknown marker types when possible.
- Preserves YAML frontmatter, fenced code blocks, and inline code.
- Applies only minimal whitespace cleanup after marker removal.

## Requirements

- Node.js 20 or later
- npm 10 or later
- Obsidian 1.5.0 or later

## Project layout

- `src/`: plugin source code
- `tests/`: automated tests
- `manifest.json`: Obsidian plugin manifest
- `versions.json`: Obsidian version compatibility map
- `main.js`: compiled plugin entry file

## Install dependencies

```bash
npm install
```

## Build

Create a production build:

```bash
npm run build
```

This compiles the plugin to `main.js` in the repository root and the CLI to `dist/cli.js`.

## Development

Start esbuild in watch mode:

```bash
npm run dev
```

Run the automated tests:

```bash
npm test
```

If you also want a TypeScript-only check:

```bash
npx tsc --noEmit
```

## Install into Obsidian

1. Build the plugin with `npm run build`.
2. Open your Obsidian vault folder.
3. Create this plugin directory if it does not already exist:

```text
<your-vault>/.obsidian/plugins/deep-research-formatter/
```

4. Copy these files into that directory:

```text
main.js
manifest.json
versions.json
```

5. In Obsidian, open `Settings` -> `Community plugins`.
6. Turn off `Restricted mode` if needed.
7. Enable `Deep Research Formatter`.

## Usage

Open a Markdown note exported from Deep Research, then use the Command Palette in Obsidian.

Available commands:

- `清理当前笔记中的 Deep Research 标记`
- `清理当前选区中的 Deep Research 标记`

Command behavior:

- The first command cleans the entire active Markdown note.
- The second command cleans only the current editor selection.
- If no Deep Research markers are found, the plugin shows a notice and does nothing.

## CLI usage

You can also format a vault directory, or any subdirectory inside it, from the command line:

```bash
npm run format:vault -- /path/to/your/vault
```

CLI behavior:

- Recursively processes `.md` files under the target directory.
- Skips `.obsidian/`, `.git/`, and `node_modules/`.
- Rewrites only files whose content actually changes.
- Prints a summary of scanned files, updated files, failures, and marker counts.
- Returns exit code `1` for invalid arguments and `2` when one or more files fail to process.

Show the CLI help text:

```bash
npm run format:vault -- --help
```

## Current marker handling

The current implementation recognizes the marker wrapper used in Deep Research exports and handles these marker types:

- `cite`: removed
- `entity`: replaced with readable text
- `url`: replaced with readable text
- unknown tags: best-effort readable fallback, otherwise removed

## Notes

- This plugin is intentionally conservative. It does not try to reformat the whole Markdown document.
- It focuses on Deep Research marker cleanup only.
