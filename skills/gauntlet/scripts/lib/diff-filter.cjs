"use strict";

// Node port of diff_filter.rb (which ui-drift-rails still uses): parse
// `git diff -U0 base...head` and decide whether a lint finding is drift the
// diff INTRODUCED. Keep the two files in step.
//
// "Introduced" means: on a line the diff added, and the drift string (the
// finding's value/snippet, whitespace-normalized) is not on a removed line of
// the same hunk, so a line rewritten for another reason doesn't carry its old
// drift into the PR. Lines the diff moved (removed verbatim elsewhere in the
// diff, e.g. markup extracted into a new partial) never count: that's old
// drift relocated, not written.

const { execFileSync, spawnSync } = require("node:child_process");

const MAX_BUFFER = 1024 * 1024 * 1024;

// Literal pathspecs: Next.js route dirs like `app/[slug]/` are not globs.
function git(repo, ...args) {
  try {
    return execFileSync("git", ["-C", repo, "--literal-pathspecs", "-c", "core.quotePath=false", ...args], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(`git ${args.join(" ")} failed`);
  }
}

function norm(str) {
  return String(str ?? "").replace(/[ \t\r\n\f\v]+/g, " ").trim();
}

// Extract `paths` (files or directories) of `ref` into `dir`.
function exportFiles(repo, ref, paths, dir) {
  const archive = spawnSync("git", ["-C", repo, "--literal-pathspecs", "archive", ref, "--", ...paths], { maxBuffer: MAX_BUFFER });
  const untar = archive.status === 0 ? spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout }) : null;
  if (!untar || untar.status !== 0) throw new Error("git archive | tar failed");
}

class DiffFilter {
  // pathspecs: limit the diff (directories, globs or explicit files).
  constructor(repo, base, head, pathspecs) {
    this.repo = repo;
    this.range = `${base}...${head}`;
    this.pathspecs = pathspecs;
    this.added = new Map(); // file => Map(line => hunk id)
    this.removed = new Map(); // hunk id => [normalized removed lines]
    this.addedRaw = []; // every added line's text
    this.addedText = new Map(); // file => Map(line => normalized text)
    this.newFiles = git(repo, "diff", "--name-only", "--diff-filter=A", this.range, "--", ...pathspecs).split("\n").filter(Boolean);
    this.parse();
  }

  get empty() {
    return this.added.size === 0;
  }

  get addedFiles() {
    return [...this.added.keys()];
  }

  hunk(file, line) {
    return this.added.get(file)?.get(line);
  }

  isAdded(file, line) {
    return this.hunk(file, line) !== undefined;
  }

  // Added by this diff and not merely moved from elsewhere in it.
  isFresh(file, line) {
    return this.isAdded(file, line) && !this.isMoved(file, line);
  }

  // Removed (normalized) lines of the hunk that added file:line; null when
  // the diff didn't add that line.
  removedNear(file, line) {
    const h = this.hunk(file, line);
    return h === undefined ? null : this.removed.get(h) || [];
  }

  // file:line's added text was removed elsewhere in the diff verbatim, as
  // part of a block: code moved between files or hunks, not written by this
  // diff. A neighbouring added line must match too, so a lone generic line
  // (`<button type="button"`) removed somewhere by coincidence doesn't hide
  // genuinely new drift.
  isMoved(file, line) {
    if (!this.removedVerbatim(file, line)) return false;
    return [-1, 1].some((dir) => {
      const n = this.neighbour(file, line, dir);
      return n !== null && this.removedVerbatim(file, n);
    });
  }

  isIntroduced(file, line, token) {
    if (!this.isFresh(file, line)) return false;
    const removed = this.removedNear(file, line);
    const t = norm(token);
    return t === "" || !removed.some((r) => r.includes(t));
  }

  // Keep findings (objects with file/line) the diff introduced. The drift
  // string is finding[tokenKey], else finding.snippet.
  filter(findings, tokenKey = "token") {
    return findings.filter((f) => this.isIntroduced(f.file, f.line, f[tokenKey] || f.snippet));
  }

  // Nearest added line above/below that isn't blank, within 3 lines.
  neighbour(file, line, dir) {
    for (let step = 1; step <= 3; step++) {
      const text = this.addedText.get(file)?.get(line + dir * step);
      if (text === undefined) return null;
      if (text !== "") return line + dir * step;
    }
    return null;
  }

  removedVerbatim(file, line) {
    const text = this.addedText.get(file)?.get(line);
    if (text === undefined || text === "") return false;
    this.removedSet ||= new Set([...this.removed.values()].flat());
    return this.removedSet.has(text);
  }

  // Header lines (---/+++) only appear between `diff --git` and the first
  // @@, so track that instead of guessing from a line's leading characters:
  // a removed CSS line `--brand: #fff` arrives as `---brand: #fff`.
  parse() {
    let file = null;
    let hunk = 0;
    let lineno = 0;
    let inHeader = false;
    const out = git(this.repo, "diff", "-U0", "--no-color", "--no-ext-diff", this.range, "--", ...this.pathspecs);
    for (const l of out.split("\n")) {
      if (l.startsWith("diff --git ")) {
        inHeader = true;
        file = null;
        continue;
      }
      if (inHeader) {
        if (l.startsWith("@@")) {
          inHeader = false;
        } else {
          if (l.startsWith("+++ b/")) file = l.slice(6);
          continue;
        }
      }
      const at = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (at) {
        hunk += 1;
        lineno = Number(at[1]);
      } else if (l.startsWith("-")) {
        if (!this.removed.has(hunk)) this.removed.set(hunk, []);
        this.removed.get(hunk).push(norm(l.slice(1)));
      } else if (l.startsWith("+")) {
        if (file) {
          if (!this.added.has(file)) this.added.set(file, new Map());
          if (!this.addedText.has(file)) this.addedText.set(file, new Map());
          this.added.get(file).set(lineno, hunk);
          this.addedText.get(file).set(lineno, norm(l.slice(1)));
        }
        this.addedRaw.push(l.slice(1));
        lineno += 1;
      }
    }
  }
}

module.exports = { DiffFilter, git, norm, exportFiles };
