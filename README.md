# gauntlet

A code-review skill for [Claude Code](https://claude.com/claude-code). It runs parallel reviewers over your diff, has a second agent try to refute every serious finding, and fixes the ones that hold up.

## Why use gauntlet

Code written with an agent arrives faster than anyone can read it closely.

Gauntlet reads it before it merges. Separate reviewers check the diff for bugs, security holes, missing tests and UI problems. Gauntlet then fixes what they find and writes the missing tests in the same PR. What reaches you is a short list of the decisions that need a person.

The numbers below come from an audit of 131 pull requests that gauntlet reviewed across 12 repositories.

| | |
|---|---|
| Real defects caught | 54, of which 34 were likely to cause harm within a month |
| Findings reported | 193 Important, 328 Nit and 41 Pre-existing, with at least 253 fixed in the same PR |
| Tests | 58% of the test lines in reviewed PRs were added after the first draft, and test files changed in 97 of the 131 PRs |
| False positives | 1 in a graded sample of 69 findings |
| Escapes | 9 defects in reviewed code needed a follow-up fix |

Things it caught before merge:

- A certificate-expiry alert that checked only part of each wildcard domain, so real outages would have gone unalerted.
- A dashboard card for failing CI that never turned red, because one CSS class overrode another.
- A staff login that looped until the browser gave up with "too many redirects".
- An admin endpoint that was exempt from CSRF protection. The hole was older than the PR, and the review still found it.

## What it does

1. Works out the diff: a range you pass, or the branch's commits plus uncommitted changes.
2. Launches one fresh agent per reviewer. Each grades its findings Important (would hurt in production) or Nit. Each reads only its own checklist and the diff. It doesn't see the conversation, so the author's reasoning can't sway it.
3. Sends every Important finding, and every confirmed Medium+ security finding, to a second agent whose job is to refute it. Findings it disproves are dropped, and overstated ones are downgraded. For a finding it can't disprove, it writes a test that should fail.
4. Runs each of those tests to watch the bug fail, fixes it, and keeps the test. It then writes and runs the property tests the test reviewer specified, so a failing property becomes a confirmed bug or, once a fresh refuter agrees the behavior is intended, a corrected property. A failing security property it can't settle goes under Needs a decision. It also fixes the Nits, proves every other new test can fail, and returns three lists: **Fixed**, **Needs a decision**, **Couldn't verify**.

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

Gauntlet runs with no setup: the reviewers only need Claude Code and git. The tools below add exact, script-driven checks on top. Gauntlet skips a missing tool and reports it. The run doesn't fail, so install only the tools for your stack.

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

A plugin update replaces the plugin folder, including the installed lint packages. To install them once, clone this repo somewhere permanent and run `npx npm@11 ci` in its `skills/gauntlet/ui-lint`. Then point `UI_LINT_DIR` at that folder in the `env` block of `~/.claude/settings.json`.

### Rails

For repos whose `Gemfile` includes `rails`.

| Tool | What it adds | Install |
|---|---|---|
| Ruby and Bundler | Run the lint and dead-code scripts | Your usual version manager |
| [guardrails](https://github.com/meticulous/guardrails) (`ui_guardrails`) | Exact UI drift candidates in views, components, helpers, stylesheets and Stimulus controllers | `git clone https://github.com/meticulous/guardrails ~/.claude/vendor/guardrails && cd ~/.claude/vendor/guardrails && bundle install` |
| spoom | New dead code: methods, classes and constants the branch orphans | `BUNDLE_GEMFILE=$GAUNTLET/spoom/Gemfile bundle install` |

Set `GUARDRAILS_DIR` to keep the guardrails clone somewhere else. Spoom runs from gauntlet's own bundle, so don't add it to your app's Gemfile.

A Rails app that also has a `package.json` gets both dead-code tools. The knip row above applies to it too, and it needs Node.

### Any project with a lockfile

| Tool | What it adds | Install |
|---|---|---|
| [osv-scanner](https://google.github.io/osv-scanner/) | Known-vulnerable package versions the diff adds to a lockfile, from Google's [OSV](https://osv.dev) database. The Security reviewer then checks whether the repo reaches the vulnerable code | `brew install osv-scanner`, or a binary from its [releases](https://github.com/google/osv-scanner/releases) |

It runs only when the diff changes a lockfile (npm, Yarn, pnpm, Bun, Bundler, Poetry, uv, pip, Go, Cargo, Composer, Maven, Gradle, NuGet and others). It sends package names and versions to api.osv.dev, never your source code.

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
