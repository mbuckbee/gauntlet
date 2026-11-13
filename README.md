# gauntlet

A code-review skill for [Claude Code](https://claude.com/claude-code). It sends your diff past a set of parallel reviewers, checks the security findings a second time, and then fixes what survives.

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
| Node 20.19+ and Ruby | Run the lint and dead-code scripts (the lint wrapper is a Ruby script that calls Node) | Your usual version manager |
| Python 3 | Normalizes dead-code output | Preinstalled on macOS and most Linux |
| ui-lint (ESLint + stylelint, bundled config) | Exact UI drift candidates: inline styles, raw colors, emoji used as icons, missing alt text and labels | `cd $GAUNTLET/ui-lint && npx npm@11 ci` |
| knip | New dead code: exports, files and dependencies the branch orphans | Nothing to install. It runs the repo's own `knip` if present, otherwise `npx knip`. The repo needs its `node_modules` installed |

A plugin update replaces the plugin folder, including the installed lint packages. To install them once, clone this repo somewhere permanent, run `npx npm@11 ci` in its `skills/gauntlet/ui-lint`, and point `UI_LINT_DIR` at that folder in the `env` block of `~/.claude/settings.json`.

### Rails

For repos whose `Gemfile` includes `rails`.

| Tool | What it adds | Install |
|---|---|---|
| Ruby and Bundler | Run the lint and dead-code scripts | Your usual version manager |
| Python 3 | Normalizes dead-code output | Preinstalled on macOS and most Linux |
| [guardrails](https://github.com/meticulous/guardrails) (`ui_guardrails`) | Exact UI drift candidates in views, components, helpers, stylesheets and Stimulus controllers | `git clone https://github.com/meticulous/guardrails ~/.claude/vendor/guardrails && cd ~/.claude/vendor/guardrails && bundle install` |
| spoom | New dead code: methods, classes and constants the branch orphans | `BUNDLE_GEMFILE=$GAUNTLET/spoom/Gemfile bundle install` |

Set `GUARDRAILS_DIR` to keep the guardrails clone somewhere else. Spoom runs from gauntlet's own bundle, so don't add it to your app's Gemfile.

A Rails app that also has a `package.json` gets both dead-code tools; the knip row above applies to it too.

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
