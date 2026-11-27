// osv-deps against throwaway git repos, with a fake osv-scanner on PATH so
// the tests run offline. Run: node --test skills/gauntlet/scripts/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "osv-deps");

// Fake osv-scanner. Reads package-lock.json (node_modules/* entries) and
// requirements files (following -r/-c relative to the file, logging any that
// are missing), looks each name@version up in $FAKE_OSV_DB, drops ids listed
// in an osv-scanner.toml beside the file, and logs its argv. A file that
// contains BROKEN makes it exit 127, like a parse failure.
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const argv = process.argv.slice(2);
if (argv[0] === "--version") process.exit(0);
const log = (s) => fs.appendFileSync(process.env.FAKE_OSV_LOG, s + "\\n");
log("argv " + JSON.stringify(argv));
const db = JSON.parse(process.env.FAKE_OSV_DB || "{}");
const results = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "-L") continue;
  const file = argv[++i].replace(/^[\\w.-]+:(?=\\/)/, "");
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("BROKEN") || (text.includes("FAILBASE") && !text.includes("HEADOK"))) { process.stderr.write("could not parse " + file + "\\n"); process.exit(127); }
  const pins = [];
  if (path.basename(file) === "package-lock.json") {
    for (const [k, v] of Object.entries(JSON.parse(text).packages || {})) {
      if (k.startsWith("node_modules/")) pins.push([k.split("node_modules/").pop(), v.version, "npm"]);
    }
  } else if (file.endsWith(".txt")) {
    const read = (f) => {
      if (!fs.existsSync(f)) return log("missing " + path.basename(f));
      for (const line of fs.readFileSync(f, "utf8").split("\\n")) {
        const inc = line.match(/^-[rc]\\s+(\\S+)/);
        if (inc) read(path.join(path.dirname(f), inc[1]));
        const pin = line.match(/^([A-Za-z0-9_.-]+)==(\\S+)/);
        if (pin) pins.push([pin[1], pin[2], "PyPI"]);
      }
    };
    read(file);
  }
  const cfg = path.join(path.dirname(file), "osv-scanner.toml");
  const ignored = fs.existsSync(cfg) ? [...fs.readFileSync(cfg, "utf8").matchAll(/id = "([^"]+)"/g)].map((m) => m[1]) : [];
  const packages = pins.map(([name, version, ecosystem]) => {
    const entries = (db[name.toLowerCase() + "@" + version] || []).map((e) => e.split("|")).filter(([id]) => !ignored.includes(id));
    const ids = entries.map(([id]) => id);
    return {
      package: { name, version, ecosystem },
      vulnerabilities: ids.map((id) => ({ id, summary: id, affected: [{ package: { name, ecosystem }, ranges: [{ events: [{ introduced: "0" }, { fixed: "9.9.9" }] }] }] })),
      groups: entries.map(([id, alias]) => ({ ids: [id], aliases: [id, alias || "CVE-" + id], max_severity: "7.5" })),
    };
  }).filter((p) => p.groups.length);
  results.push({ source: { path: file, type: "lockfile" }, packages });
}
process.stdout.write(JSON.stringify({ results }));
process.exit(results.some((r) => r.packages.length) ? 1 : 0);
`;

const lock = (deps) =>
  JSON.stringify({
    name: "x",
    lockfileVersion: 3,
    packages: Object.fromEntries([["", { name: "x" }], ...Object.entries(deps).map(([k, v]) => [`node_modules/${k}`, { version: v }])]),
  });

// A repo whose `main` holds `base` files; `head` files are then written and,
// with commit: true, committed on branch `pr`.
function setup(t, { base = {}, head = {}, commit = true, db = {} }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "osv-deps-test-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "osv-scanner"), FAKE, { mode: 0o755 });
  const logFile = path.join(tmp, "osv.log");
  fs.writeFileSync(logFile, "");
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "pipe" });
  const write = (files) => {
    for (const [f, body] of Object.entries(files)) {
      const p = path.join(repo, f);
      if (body === null) { fs.rmSync(p); continue; }
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    }
  };
  git("init", "-q", "-b", "main");
  write({ README: "x\n", ...base });
  git("add", "-A");
  git("commit", "-qm", "base");
  git("switch", "-qc", "pr");
  write(head);
  if (commit) { git("add", "-A"); git("commit", "-qm", "head"); }
  const run = (args = [], { path: PATH = `${bin}${path.delimiter}${process.env.PATH}` } = {}) =>
    JSON.parse(
      execFileSync(process.execPath, [SCRIPT, "--repo", repo, "--base", "main", ...args], {
        encoding: "utf8",
        env: { ...process.env, PATH, FAKE_OSV_LOG: logFile, FAKE_OSV_DB: JSON.stringify(db) },
      }),
    );
  const log = () => fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
  return { repo, git, run, log };
}

const ids = (list) => list.map((v) => `${v.package}@${v.version} ${v.id}`).sort();

test("a bump to a version that is still vulnerable keeps the shared advisory pre_existing", (t) => {
  const { run } = setup(t, {
    db: { "lodash@1.0.0": ["OLD", "FIXED"], "lodash@1.0.1": ["OLD"] },
    base: { "package-lock.json": lock({ lodash: "1.0.0" }) },
    head: { "package-lock.json": lock({ lodash: "1.0.1" }) },
  });
  const r = run(["--head", "HEAD"]);
  assert.equal(r.error, undefined, r.error);
  assert.deepEqual(ids(r.introduced), []);
  assert.deepEqual(ids(r.pre_existing), ["lodash@1.0.1 OLD"]);
});

test("a new advisory is introduced, with its aliases, fixed versions and lockfile path", (t) => {
  const { run } = setup(t, {
    db: { "lodash@1.0.0": ["OLD"], "minimist@1.2.0": ["NEW"] },
    base: { "web/package-lock.json": lock({ lodash: "1.0.0" }) },
    head: { "web/package-lock.json": lock({ lodash: "1.0.0", minimist: "1.2.0" }) },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(r.lockfiles, ["web/package-lock.json"]);
  assert.deepEqual(ids(r.introduced), ["minimist@1.2.0 NEW"]);
  assert.deepEqual(ids(r.pre_existing), ["lodash@1.0.0 OLD"]);
  const [v] = r.introduced;
  assert.equal(v.lockfile, "web/package-lock.json");
  assert.deepEqual(v.aliases, ["CVE-NEW"]);
  assert.deepEqual(v.fixed, ["9.9.9"]);
});

test("advisories ignored by the repo's osv-scanner.toml stay ignored", (t) => {
  const { run } = setup(t, {
    db: { "lodash@1.0.0": ["IGNORED", "REAL"] },
    base: { "app/osv-scanner.toml": '[[IgnoredVulns]]\nid = "IGNORED"\n' },
    head: { "app/package-lock.json": lock({ lodash: "1.0.0" }) },
  });
  for (const args of [[], ["--head", "HEAD"]]) {
    assert.deepEqual(ids(run(args).introduced), ["lodash@1.0.0 REAL"], `args ${args}`);
  }
});

test("a changed osv-scanner.toml is listed so the reviewer can check new ignores", (t) => {
  const { run } = setup(t, {
    db: { "lodash@1.0.0": ["HIDDEN"] },
    base: { "package-lock.json": lock({ lodash: "1.0.0" }) },
    head: { "package-lock.json": lock({ lodash: "1.0.0" }) + "\n", "osv-scanner.toml": 'id = "HIDDEN"\n' },
  });
  assert.deepEqual(run(["--head", "HEAD"]).configs_changed, ["osv-scanner.toml"]);
});

test("requirements.txt -r/-c includes are scanned with the file", (t) => {
  const { run, log } = setup(t, {
    db: { "urllib3@1.24.1": ["U"], "requests@2.19.0": ["R"], "idna@2.7": ["I"] },
    head: {
      "sub/requirements.txt": "requests==2.19.0\n-r base.txt\n-c constraints.txt\n",
      "sub/base.txt": "urllib3==1.24.1\n",
      "sub/constraints.txt": "idna==2.7\n",
    },
  });
  for (const args of [[], ["--head", "HEAD"]]) {
    const r = run(args);
    assert.deepEqual(ids(r.introduced), ["idna@2.7 I", "requests@2.19.0 R", "urllib3@1.24.1 U"], `args ${args}`);
  }
  assert.deepEqual(log().filter((l) => l.startsWith("missing")), []);
});

test("a change to a file pulled in by -r rescans the requirements file that includes it", (t) => {
  const { run } = setup(t, {
    db: { "urllib3@1.24.1": ["U"] },
    base: { "requirements.txt": "-r requirements/base.in\n", "requirements/base.in": "urllib3==1.24.0\n" },
    head: { "requirements/base.in": "urllib3==1.24.1\n" },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(r.lockfiles, ["requirements.txt"]);
  assert.deepEqual(ids(r.introduced), ["urllib3@1.24.1 U"]);
});

test("variant requirements file names are scanned", (t) => {
  const { run } = setup(t, {
    db: { "django@2.0": ["D"] },
    head: { "requirements-dev.txt": "django==2.0\n", "requirements/prod.txt": "django==2.0\n" },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(r.lockfiles.sort(), ["requirements-dev.txt", "requirements/prod.txt"]);
  assert.equal(r.introduced.length, 2);
});

test("every scan passes --no-resolve, so a PR's pom.xml can't make the reviewer fetch its URLs", (t) => {
  const { run, log } = setup(t, {
    head: { "pom.xml": "<project><repositories><repository><url>http://127.0.0.1:9/x</url></repository></repositories></project>\n" },
  });
  assert.deepEqual(run(["--head", "HEAD"]).lockfiles, ["pom.xml"]);
  const calls = log().filter((l) => l.startsWith("argv"));
  assert.ok(calls.length > 0);
  for (const c of calls) assert.ok(c.includes('"--no-resolve"'), c);
});

test("uncommitted and untracked lockfile edits count when --head is omitted", (t) => {
  const { run } = setup(t, {
    db: { "minimist@1.2.0": ["NEW"] },
    head: { "package-lock.json": lock({ minimist: "1.2.0" }) },
    commit: false,
  });
  assert.deepEqual(ids(run().introduced), ["minimist@1.2.0 NEW"]);
});

test("a moved lockfile keeps its advisories pre_existing", (t) => {
  const { repo, git, run } = setup(t, {
    db: { "lodash@1.0.0": ["OLD"] },
    base: { "package-lock.json": lock({ lodash: "1.0.0" }) },
    commit: false,
  });
  fs.mkdirSync(path.join(repo, "app"));
  git("mv", "package-lock.json", "app/package-lock.json");
  git("commit", "-qm", "move");
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(ids(r.introduced), []);
  assert.deepEqual(ids(r.pre_existing), ["lodash@1.0.0 OLD"]);
});

test("one unparseable lockfile is reported without losing the others", (t) => {
  const { run } = setup(t, {
    db: { "minimist@1.2.0": ["NEW"] },
    head: { "a/package-lock.json": lock({ minimist: "1.2.0" }), "b/package-lock.json": "BROKEN" },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(ids(r.introduced), ["minimist@1.2.0 NEW"]);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].lockfile, "b/package-lock.json");
  assert.match(r.errors[0].message, /exited 127/);
});

test("skips: no lockfile changed, osv-scanner missing, unknown base", (t) => {
  const { repo, run } = setup(t, { head: { README: "y\n" } });
  assert.deepEqual(run(["--head", "HEAD"]), { skipped: "no lockfile changed" });
  fs.writeFileSync(path.join(repo, "package-lock.json"), lock({}));
  const noScanner = run([], { path: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin` });
  assert.match(noScanner.skipped, /osv-scanner not installed/);
  assert.deepEqual(noScanner.lockfiles, ["package-lock.json"]);
  assert.match(run(["--base", "nope"]).skipped, /base ref nope not found/);
});

test("an advisory whose primary id changes between versions still matches through its aliases", (t) => {
  const { run } = setup(t, {
    db: { "django@2.0": ["GHSA-A|PYSEC-A"], "django@2.2.0": ["PYSEC-A|GHSA-A"] },
    base: { "requirements.txt": "django==2.0\n" },
    head: { "requirements.txt": "django==2.2.0\n" },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(ids(r.introduced), []);
  assert.deepEqual(ids(r.pre_existing), ["django@2.2.0 PYSEC-A"]);
});

test("a new copy added beside a still-present vulnerable version is introduced", (t) => {
  const { run } = setup(t, {
    db: { "foo@1.0.0": ["X"], "foo@1.1.0": ["X"] },
    base: { "package-lock.json": lock({ "a/node_modules/foo": "1.0.0" }) },
    head: { "package-lock.json": lock({ "a/node_modules/foo": "1.0.0", foo: "1.1.0" }) },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(ids(r.introduced), ["foo@1.1.0 X"]);
  assert.deepEqual(ids(r.pre_existing), ["foo@1.0.0 X"]);
});

test("export-ignore in .gitattributes doesn't hide a lockfile from the snapshot", (t) => {
  const { run } = setup(t, {
    db: { "django@2.0": ["D"], "requests@2.0": ["R"] },
    base: { ".gitattributes": "requirements.txt export-ignore\n", "requirements.txt": "requests==2.0\n" },
    head: { "requirements.txt": "requests==2.0\ndjango==2.0\n" },
  });
  for (const args of [[], ["--head", "HEAD"]]) {
    const r = run(args);
    assert.deepEqual(ids(r.introduced), ["django@2.0 D"], `args ${args}`);
    assert.deepEqual(ids(r.pre_existing), ["requests@2.0 R"], `args ${args}`);
  }
});

test("a requirements file deleted from disk but still in the index doesn't break the run", (t) => {
  const { repo, run } = setup(t, {
    db: { "minimist@1.2.0": ["NEW"] },
    base: { "requirements-old.txt": "x==1\n", "app.js": "1\n" },
    head: { "app.js": "2\n", "package-lock.json": lock({ minimist: "1.2.0" }) },
    commit: false,
  });
  fs.rmSync(path.join(repo, "requirements-old.txt"));
  const r = run();
  assert.equal(r.error, undefined, r.error);
  assert.deepEqual(ids(r.introduced), ["minimist@1.2.0 NEW"]);
});

test("a change reached through nested includes rescans the requirements file", (t) => {
  const { run } = setup(t, {
    db: { "urllib3@1.24.1": ["U"] },
    base: {
      "requirements.txt": "-r requirements/base.in\n",
      "requirements/base.in": "-r common.in\n",
      "requirements/common.in": "urllib3==1.24.0\n",
    },
    head: { "requirements/common.in": "urllib3==1.24.1\n" },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(r.lockfiles, ["requirements.txt"]);
  assert.deepEqual(ids(r.introduced), ["urllib3@1.24.1 U"]);
});

test("when the base scan fails, head advisories are unclassified, not introduced", (t) => {
  const { run } = setup(t, {
    db: { "lodash@1.0.0": ["OLD"] },
    base: { "requirements.txt": "# FAILBASE\nlodash==1.0.0\n" },
    head: { "requirements.txt": "# FAILBASE HEADOK\nlodash==1.0.0\n" },
  });
  const r = run(["--head", "HEAD"]);
  assert.deepEqual(ids(r.introduced), []);
  assert.deepEqual(ids(r.unclassified), ["lodash@1.0.0 OLD"]);
  assert.equal(r.errors[0].side, "base");
});

test("a merge-base failure on a valid base ref is an error, not a skip", (t) => {
  const { git, run } = setup(t, { head: { "package-lock.json": lock({}) } });
  git("switch", "-q", "--orphan", "other");
  git("commit", "-q", "--allow-empty", "-m", "unrelated");
  const r = run(["--head", "HEAD"]);
  assert.equal(r.skipped, undefined);
  assert.match(r.error, /merge-base/);
});

test("a flag with no value is an error", (t) => {
  const { run } = setup(t, { head: { "package-lock.json": lock({}) } });
  assert.match(run(["--head"]).error, /missing value for --head/);
});
