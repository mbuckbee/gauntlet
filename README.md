# gauntlet

A code-review skill for [Claude Code](https://claude.com/claude-code). It sends your diff past a set of parallel reviewers, checks the security findings a second time, and then fixes what survives.

## Why use gauntlet

Code written with an agent arrives faster than anyone can read it closely. Gauntlet is the second look: reviewers that never heard why a shortcut seemed fine, a refutation pass before a security finding is believed, and fixes applied in the same run.

The numbers below come from one developer's week of real work (5–12 November 2026), audited afterwards. Gauntlet reviewed 131 of the 158 pull requests merged that week across 12 repositories.

| | |
|---|---|
| Real defects caught | About 50, of which about 30 were likely to cause harm within a month |
| Findings reported | About 520, at least 253 of them fixed in the same PR |
| Tests | 58% of the test lines in reviewed PRs were added after the first draft, and test files changed in 97 of the 131 PRs |
| False positives | 1 in a graded sample of 69 findings |
| Escapes | 9 defects in reviewed code needed a follow-up fix that week |

Things it caught before merge:

- A certificate-expiry alert that checked only part of each wildcard domain, so real outages would have gone unalerted.
- A dashboard card for failing CI that never turned red, because one CSS class overrode another.
- A staff login that looped until the browser gave up with "too many redirects".
- An admin endpoint that was exempt from CSRF protection. The hole was older than the PR; the review found it anyway.

### What it costs

A reviewed PR used about 1.8 million price-weighted tokens end to end, and review and shipping took 37% of that week's Claude Code usage. That is about 5 million weighted tokens per real defect caught. Most of the cost is the parallel reviewers, which is why a docs-only diff now skips two of them.

### What it won't do

- **It grades generously.** When fresh agents re-graded 69 findings the review had called Important, 28% would actually have caused harm. The rest were edge cases, test gaps and refactors: worth fixing, but not urgent.
- **It checks the diff against itself.** Every production defect that got past it came from how an outside system really behaves: API list caps, rate limits, busy errors. If your code talks to a third-party API, say what its failure modes are in your repo's `REVIEW.md`.
- **The catch rate is an estimate.** About 50 caught against 9 escaped suggests most harmful defects were stopped, but nearly every PR was reviewed, so there was no control group to compare with.

These figures were measured on the version of the skill that preceded this repo, before the docs-only rule and before the per-reviewer cap on findings was removed.

## What it does

1. Works out the diff: a range you pass, or the branch's commits plus uncommitted changes.
2. Launches one fresh agent per reviewer. Each reads only its own checklist and the diff, never the conversation, so it can't be talked into the author's reasoning.
3. Sends every confirmed Medium+ security finding to a second agent whose job is to refute it.
4. Fixes what survives, proves each new test can fail, and returns three lists: **Fixed**, **Needs a decision**, **Couldn't verify**.

| Reviewer | Runs | Checklist |
|---|---|---|
| Reuse & Structure | always | [structure.md](skills/gauntlet/references/structure.md) |
| Code Quality | always | [quality.md](skills/gauntlet/references/quality.md) |
| Efficiency | when the diff changes code | [efficiency.md](skills/gauntlet/references/efficiency.md) |
| Security | always | [security.md](skills/gauntlet/references/security.md) |
| Test Coverage | when the diff changes code | [tests.md](skills/gauntlet/references/tests.md) |
| UI Drift | when the diff touches UI | [ui-drift.md](skills/gauntlet/references/ui-drift.md) |
| Accessibility | when the diff touches UI | [accessibility.md](skills/gauntlet/references/accessibility.md) |

A diff that changes only documentation (Markdown, plain text, images) skips Efficiency and Test Coverage.

## Install

As a plugin:

```
/plugin marketplace add mbuckbee/gauntlet
/plugin install gauntlet@gauntlet
```

The skill is then `/gauntlet:gauntlet`.

Or as a personal skill, which gives you plain `/gauntlet`:

```bash
git clone https://github.com/mbuckbee/gauntlet ~/src/gauntlet
ln -s ~/src/gauntlet/skills/gauntlet ~/.claude/skills/gauntlet
```

## Use

```
/gauntlet                       # every reviewer, branch commits + uncommitted changes
/gauntlet origin/main...HEAD    # a specific range
/gauntlet security tests        # only the named reviewers
/gauntlet dead-code             # only the dead-code check
```

Reviewer names: `structure`, `quality`, `efficiency`, `security`, `tests`, `ui-drift`, `accessibility`.

If the repo has a `REVIEW.md`, gauntlet reads it and hands it to every reviewer. Use it to say what failure looks like in that codebase and what to skip.

## Setup

Gauntlet runs with no setup: the reviewers only need Claude Code and git. The tools below add exact, script-driven checks on top. A missing tool is skipped and reported, never a failure, so install only the ones for your stack.

The commands use `$GAUNTLET` for the skill's folder:

- Plugin install: `~/.claude/plugins/cache/gauntlet/gauntlet/<version>/skills/gauntlet`
- Personal skill: `~/.claude/skills/gauntlet`

### JavaScript / TypeScript

For repos with a `package.json`: Next.js, React, Astro, plain CSS or CSS Modules.

| Tool | What it adds | Install |
|---|---|---|
| Node 20.19+ | Runs the lint and dead-code scripts | Your usual version manager |
| ui-lint (ESLint + stylelint, bundled config) | Exact UI drift candidates: inline styles, raw colors, emoji used as icons, missing alt text and labels | `cd $GAUNTLET/ui-lint && npx npm@11 ci` |
| knip | New dead code: exports, files and dependencies the branch orphans | Nothing to install. It runs the repo's own `knip` if present, otherwise `npx knip`. The repo needs its `node_modules` installed |

A plugin update replaces the plugin folder, including the installed lint packages. To install them once, clone this repo somewhere permanent, run `npx npm@11 ci` in its `skills/gauntlet/ui-lint`, and point `UI_LINT_DIR` at that folder in the `env` block of `~/.claude/settings.json`.

### Rails

For repos whose `Gemfile` includes `rails`.

| Tool | What it adds | Install |
|---|---|---|
| Ruby and Bundler | Run the lint and dead-code scripts | Your usual version manager |
| [guardrails](https://github.com/meticulous/guardrails) (`ui_guardrails`) | Exact UI drift candidates in views, components, helpers, stylesheets and Stimulus controllers | `git clone https://github.com/meticulous/guardrails ~/.claude/vendor/guardrails && cd ~/.claude/vendor/guardrails && bundle install` |
| spoom | New dead code: methods, classes and constants the branch orphans | `BUNDLE_GEMFILE=$GAUNTLET/spoom/Gemfile bundle install` |

Set `GUARDRAILS_DIR` to keep the guardrails clone somewhere else. Spoom runs from gauntlet's own bundle, so don't add it to your app's Gemfile.

A Rails app that also has a `package.json` gets both dead-code tools; the knip row above applies to it too, and needs Node.

### Any project with a UI

| Tool | What it adds | Install |
|---|---|---|
| chrome-devtools MCP server | The rendered accessibility pass: keyboard walk, focus handling, contrast from computed styles, axe-core | Add the server to Claude Code and have your dev server running |

Without it, the Accessibility reviewer does its static pass and lists what it couldn't render.

## Credits

- The UI drift checks are a framework-agnostic port of the static detectors in [meticulous/guardrails](https://github.com/meticulous/guardrails) (MIT), which the Rails lint script also runs directly.
- The structure checks fold in ideas from the `thermo-nuclear-code-quality-review` skill in pstack (MIT).

## License

MIT
