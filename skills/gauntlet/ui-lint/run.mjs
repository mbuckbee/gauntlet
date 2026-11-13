#!/usr/bin/env node
// Lint exported UI files with the sidecar's own ESLint + stylelint configs.
//   node run.mjs --root DIR file...   (files relative to DIR)
// Prints {findings:[{check,file,line,column,snippet,token,...}], parse_errors, raw_counts}.
// `token` is the drift string ui-drift-js matches against removed lines.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import stylelint from "stylelint";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ESLINT_EXT = /\.(?:[cm]?[jt]sx?|astro)$/;
const STYLE_EXT = /\.(?:css|scss|astro|vue|svelte)$/;

const args = process.argv.slice(2);
const root = path.resolve(args[args.indexOf("--root") + 1]);
const files = args.filter((a, i) => a !== "--root" && args[i - 1] !== "--root");

const findings = [];
const parseErrors = [];
const sources = new Map();
const lines = (file) => {
  if (!sources.has(file)) sources.set(file, fs.readFileSync(path.join(root, file), "utf8").split("\n"));
  return sources.get(file);
};

function locate(file, m) {
  const src = lines(file);
  const text = src[m.line - 1] ?? "";
  const startCol = (m.column ?? 1) - 1;
  const endCol = m.endLine === m.line && m.endColumn ? m.endColumn - 1 : text.length;
  return { snippet: text.trim().slice(0, 240), token: text.slice(startCol, endCol).trim() };
}

function checkFor(m) {
  const rule = m.ruleId || m.rule || "";
  const a11y = rule.match(/(?:^|\/)jsx-a11y\/(.+)$/);
  if (a11y) return { check: `a11y_${a11y[1].replace(/-/g, "_")}` };
  switch (rule) {
    case "react/forbid-dom-props": return { check: "inline_style" };
    case "no-restricted-syntax": return { check: m.message.split(":")[0] };
    case "ui-drift/emoji-icon": {
      const [, tier, char] = m.message.split(" ");
      return { check: "emoji_icon", tier, char };
    }
    case "ui-drift/raw-color-attr":
    case "ui-drift/raw-color": return { check: "raw_color" };
    default: return { check: rule || "unknown" };
  }
}

const eslintFiles = files.filter((f) => ESLINT_EXT.test(f));
const styleFiles = files.filter((f) => STYLE_EXT.test(f));

if (eslintFiles.length) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(HERE, "eslint.config.js"),
    ignore: false,
    errorOnUnmatchedPattern: false,
  });
  for (const r of await eslint.lintFiles(eslintFiles)) {
    const file = path.relative(root, r.filePath);
    for (const m of r.messages) {
      if (m.fatal) {
        parseErrors.push({ file, line: m.line, message: m.message });
        continue;
      }
      if (!m.ruleId) continue; // e.g. "has no effect because of noInlineConfig"
      findings.push({ ...checkFor(m), file, line: m.line, column: m.column, ...locate(file, m), rule: m.ruleId });
    }
  }
}

if (styleFiles.length) {
  const { results } = await stylelint.lint({
    files: styleFiles.map((f) => path.join(root, f)),
    cwd: root,
    configFile: path.join(HERE, "stylelint.config.js"),
    configBasedir: HERE,
    ignoreDisables: true,
    allowEmptyInput: true,
    disableDefaultIgnores: true,
  });
  for (const r of results) {
    const file = path.relative(root, r.source);
    for (const w of r.warnings) {
      if (w.rule !== "ui-drift/raw-color") {
        parseErrors.push({ file, line: w.line, message: w.text });
        continue;
      }
      const loc = locate(file, w);
      findings.push({ check: "raw_color", file, line: w.line, column: w.column, ...loc, rule: w.rule });
    }
    for (const e of r.parseErrors || []) parseErrors.push({ file, line: e.line, message: e.text });
  }
}

// postcss-html also reads inline style="" attributes, which ESLint's
// raw-color-attr already reported: keep one per location.
const seen = new Set();
const unique = findings.filter((f) => {
  const key = [f.check, f.file, f.line, f.column, f.token].join("\0");
  return !seen.has(key) && seen.add(key);
});
const rawCounts = {};
for (const f of unique) rawCounts[f.check] = (rawCounts[f.check] || 0) + 1;
process.stdout.write(JSON.stringify({ findings: unique, parse_errors: parseErrors, raw_counts: rawCounts }));
