# Dead code

Finds dead code with tools, not grep: knip for JS/TS repos, spoom deadcode for Ruby/Rails. By default it reports only what the current branch newly orphans versus `origin/main`, so pre-existing dead code and the tools' standing false positives drop out.

Run the script from anywhere inside the repo (`<skill dir>` is the gauntlet skill's directory):

```bash
<skill dir>/scripts/dead-code.sh            # new candidates vs merge-base with origin/main
<skill dir>/scripts/dead-code.sh --full     # every candidate in the repo
<skill dir>/scripts/dead-code.sh --base origin/develop
```

- `package.json` present → **knip** (the repo's own `node_modules/.bin/knip` if installed, else `npx knip@5.88.1`). Needs `node_modules`; run `npm ci` first in a fresh worktree. A committed `knip.json` is honoured on both sides.
- `Gemfile.lock` present → **spoom deadcode**, run from the skill's own bundle (`<skill dir>/spoom/Gemfile`). Never `gem exec spoom` or add spoom to the project: spoom's `rbi` dependency pins `prism ~> 1.0`, which conflicts with a global prism 2.x.
- Both present (Rails app with JS) → both run.
- Exit 0: nothing (new). 1: candidates printed. 2: tool error, with the reason on stderr.

Diff mode compares the working tree against a `git archive` of the merge-base, keyed by tool + kind + file + symbol with line numbers stripped, so a finding that only moved isn't new. It's read-only: no checkout, no stash, nothing written to the repo.

## Candidates are not verdicts

Each candidate needs one confirming grep before you delete it: the whole repo, including tests, scripts, config, routes, views and string references. Both tools miss references that only exist at runtime:

| Pattern | Example |
|---|---|
| Called by name: `send`, `public_send`, a symbol or string allowlist | `run_check(:check_foo)`, a worker's `ALLOWED_METHODS` |
| Framework hook or override | `process_action`, `ActiveRecord::Type#deserialize`, mailer previews |
| Called from a `.rake` file (spoom doesn't scan them) | `analyzer.fetch_tickets` in `lib/tasks/*.rake` |
| Script or CLI run by hand (knip) | `scripts/*.mjs` → add to `entry` in `knip.json` |
| Exported but only used in its own file (knip) | Not dead; the `export` is just unnecessary. `"ignoreExportsUsedInFile": true` silences these |
| Public API another repo consumes | published package exports, a route an external client calls |

Diff mode mostly avoids these, since a standing false positive is in the base too. What it does report is usually real: the branch removed the last caller of something.

## Fixing

- **In a gauntlet run:** a confirmed candidate is a contained fix (Reuse & Structure rung 15): delete the definition, and the package or gem when the tool reports it unused. Re-run the script; it should report 0.
- **In `--full` sweeps:** batch deletions by area, one PR per area, each with the grep evidence. Don't sweep in a feature PR.
- If a candidate is a real false positive that will recur, fix the tool's view rather than ignoring it: knip `entry`/`ignore` in `knip.json`. Spoom has no project config here, so leave its false positives to diff mode.
