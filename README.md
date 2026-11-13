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
| Efficiency | always | [efficiency.md](skills/gauntlet/references/efficiency.md) |
| Security | always | [security.md](skills/gauntlet/references/security.md) |
| Test Coverage | always | [tests.md](skills/gauntlet/references/tests.md) |
| UI Drift | when the diff touches UI | [ui-drift.md](skills/gauntlet/references/ui-drift.md) |
| Accessibility | when the diff touches UI | [accessibility.md](skills/gauntlet/references/accessibility.md) |

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

## Optional setup

Everything below is optional. A missing tool is skipped and reported, never a failure.

- **UI drift lint for JS/TS, Astro and CSS**: run `npx npm@11 ci` in `skills/gauntlet/ui-lint`. To keep the install somewhere that survives plugin updates, copy that folder elsewhere and set `UI_LINT_DIR` to it.
- **UI drift lint for Rails**: `git clone https://github.com/meticulous/guardrails ~/.claude/vendor/guardrails && cd ~/.claude/vendor/guardrails && bundle install`. Set `GUARDRAILS_DIR` to use another location.
- **Dead code**: knip runs through `npx` for repos with a `package.json`. For Ruby repos, run `bundle install` in `skills/gauntlet/spoom`.
- **Rendered accessibility pass**: needs the chrome-devtools MCP server and a running dev server. Without them the reviewer does its static pass and says what it couldn't render.

The scripts need Ruby, Node and Python 3 on your `PATH`.

## Credits

- The UI drift checks are a framework-agnostic port of the static detectors in [meticulous/guardrails](https://github.com/meticulous/guardrails) (MIT), which the Rails lint script also runs directly.
- The structure checks fold in ideas from the `thermo-nuclear-code-quality-review` skill in pstack (MIT).

## License

MIT
