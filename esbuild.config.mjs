import esbuild from "esbuild";
import process from "node:process";

const mode = process.argv[2] ?? "watch";
const production = mode === "production";
const cliOnly = mode === "cli";
const watchMode = !production && !cliOnly;

const sharedOptions = {
  bundle: true,
  format: "cjs",
  target: "es2020",
  sourcemap: watchMode ? "inline" : false,
  minify: production,
  logLevel: "info",
};

const buildOptions = [
  {
    ...sharedOptions,
    entryPoints: ["src/cli.ts"],
    outfile: "dist/cli.js",
    platform: "node",
  },
];

if (!cliOnly) {
  buildOptions.unshift({
    ...sharedOptions,
    entryPoints: ["src/main.ts"],
    external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
    outfile: "main.js",
  });
}

const contexts = await Promise.all(buildOptions.map((options) => esbuild.context(options)));

if (watchMode) {
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(contexts.map((context) => context.rebuild()));
  await Promise.all(contexts.map((context) => context.dispose()));
}
