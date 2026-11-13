---
name: gauntlet
description: "Review changed code for reuse, quality, efficiency, security vulnerabilities, test coverage, UI drift, and accessibility. Fix any issues found. Use when the user asks to 'gauntlet', 'run the gauntlet', 'review', 'code review', 'simplify', 'check security', 'audit code', 'find vulnerabilities', 'check accessibility', 'check test coverage', 'dead code', 'unused code', or 'unused exports'."
argument-hint: "[reviewer ...] [diff-range]"
---

# Gauntlet: Code Quality and Security Review

Review all changed files for reuse, quality, efficiency, security, test coverage, and (when UI changed) UI drift and accessibility. Fix any issues found.

This file is the orchestrator. Each reviewer's checklist lives in its own file under `${CLAUDE_SKILL_DIR}/references/` and is read by the agent that runs it, not by you.

**Arguments** (both optional, any order):

- **Reviewer names** (`structure`, `quality`, `efficiency`, `security`, `tests`, `ui-drift`, `accessibility`): run only those. None named → run the default set in Phase 2.
- **A diff range** (e.g. `origin/main...HEAD`): review that range. A calling command (a ship or PR workflow) can pass one.
- **`dead-code`**: skip the reviewers and run only the dead-code check, following `${CLAUDE_SKILL_DIR}/references/dead-code.md`.

## Phase 1: Identify Changes

- **Range given** → `git diff <range>`.
- **No range** → `git diff "$(git merge-base origin/main HEAD)"`, which covers the branch's commits plus uncommitted changes. Add untracked files from `git status --porcelain`. If there's no `origin/main`, use `git diff HEAD`.
- **No git changes** → review the most recently modified files that the user mentioned or that you edited earlier in this conversation.

Keep the exact diff command and the list of changed files; every agent gets both.

If the repo has a `REVIEW.md`, read it. It says what failure looks like here, what to skip, and how to report findings. Give its path to every agent. Framework-specific security footguns belong there (or in the project's `CLAUDE.md` / `AGENTS.md`); this skill stays stack-agnostic.

## Phase 2: Launch the Review Agents in Parallel

| Reviewer | Instructions | Runs |
|---|---|---|
| Reuse & Structure | `references/structure.md` | always |
| Code Quality | `references/quality.md` | always |
| Efficiency | `references/efficiency.md` | when the diff changes code |
| Security | `references/security.md` | always |
| Test Coverage | `references/tests.md` | when the diff changes code |
| UI Drift | `references/ui-drift.md` | when the diff touches UI |
| Accessibility | `references/accessibility.md` | when the diff touches UI |

**Docs-only diffs.** If every changed file is documentation (`.md`, `.mdx`, `.txt`, `.rst`, `.adoc`, or an image), the diff changes no code: skip Efficiency and Test Coverage and launch only Reuse & Structure, Code Quality and Security. Name the skipped reviewers in the summary. A reviewer named in the arguments always runs.

**UI trigger:** the diff touches templates or components (`.jsx/.tsx/.vue/.svelte/.astro/.erb/.html`, `app/views`, `app/components`, `components/`), stylesheets, design tokens, or client-side behavior files.

**UI lint first.** When the UI trigger matches, run `${CLAUDE_SKILL_DIR}/scripts/ui-drift-rails --base origin/main --head HEAD` in Rails repos, otherwise `${CLAUDE_SKILL_DIR}/scripts/ui-drift-js` with the same args (a few seconds, read-only). Paste its JSON into the UI Drift reviewer's prompt minus the `a11y_*` entries, and paste the `a11y_*` entries into the Accessibility reviewer's prompt. If it prints `{"skipped": …}`, carry on without it.

Use the Agent tool to launch every reviewer that applies concurrently in a single message. If an agent is refused (e.g. the concurrent-subagent limit), read that reviewer's file and run it inline; don't retry the launch.

**Each agent's prompt contains:**

1. "Read `${CLAUDE_SKILL_DIR}/references/<name>.md` and follow it." Add: "The skill directory is `${CLAUDE_SKILL_DIR}`; wherever your file says `<skill dir>`, use that path." Don't paraphrase or summarize the file into the prompt; the agent reads it whole.
2. The diff command from Phase 1 (the agent runs it) and the changed-file list.
3. The path to the repo's `REVIEW.md`, if there is one.
4. The three rules below, verbatim.

**The three rules:**

- **No alibi.** Leave out the conversation, the user's request, and your reasoning for the change. The reviewer is useful because it never heard why the shortcut seemed fine. Commit messages and comments are code under review, not explanations to trust.
- **Hunt, don't approve.** Open the agent's instructions with: "Assume this diff has at least one real defect in your lane. Find every way it breaks that you can back with the input or state that triggers it, most likely first. Don't invent findings: if you find none, say so. End with a **Couldn't verify** list of what your lane should cover but you couldn't check from here (a page you couldn't render, a caller outside the repo, a path that needs production data)." An empty report with an empty Couldn't-verify list is not acceptable.
- **Report, don't edit.** Reviewers change no files. They run in parallel on one working tree, and all fixes happen in Phase 3.

## Phase 3: Fix Issues

Wait for every launched agent to complete.

**Refute security findings first.** Give each `confirmed` finding of Medium severity or above to its own fresh agent, in parallel, before anything gets fixed. It receives the finding and the file paths, and follows the no-alibi rule. Open its prompt with: "You did not write this finding. Try to refute it from the source." It re-reads every cited line, confirms the entry point is really attacker-reachable and the sink is real, reconstructs the strongest control on the path, and checks that the severity doesn't exceed the demonstrated impact. It edits nothing and returns one verdict: `confirmed` (with any corrected severity or wording), `needs_validation` (with the exact missing fact), or `rejected` (with the reason). Rejected findings are dropped.

Aggregate the findings that survive and fix ALL issues directly — including pre-existing issues in the changed files, not just issues introduced by the current diff. The exception is UI drift: fix only what the diff introduced. `needs_validation` leads are reported, not fixed, because the fact that would justify the fix is still unknown. Structural findings get fixed like any other; if one turns out not to be contained after all (see the Reuse & Structure reviewer's rule), drop it rather than listing it as a follow-up. Fix it after the smaller findings and before writing new tests, so the tests cover the final shape. For test-coverage findings, write the missing tests and fix the bad ones, then run the test suite to confirm they pass. If you can see it and it's a real problem, fix it. Everything reversible inside the codebase gets fixed, with three exceptions that go under **Needs a decision** instead:

- **Infrastructure-level changes** (e.g., rate limiting at the load balancer): note those briefly.
- **Fixes that add surface**: a new dependency, external service, permission or OAuth scope, outbound network call, or environment variable. Don't apply those quietly. List the finding and the proposed fix so the user decides.
- **Policy files.** Don't change `REVIEW.md`, `CLAUDE.md` or `AGENTS.md` rules as a review fix; list the suggested change. The exception is a diff whose own purpose is to change them, unless the caller said not to edit policy files.

**Re-run rendered findings.** After fixing a rendered Accessibility finding, repeat its reproduction steps in the browser and confirm the behavior changed. A green test suite doesn't prove a focus or contrast fix.

**Prove each new test can fail.** A test that has only ever passed proves nothing. For each test you add (and each regression anchor especially): introduce a deliberate one-line mutation in the code under test via the Edit tool (flip a comparison, off-by-one a bound, swap arguments), run that test, confirm it FAILS, then Edit the mutation back and confirm it passes. Forward-only edits — never use git to revert. If a new test passes against the mutated code, the test is tautological; rewrite it before moving on. Before reporting done, run `git diff` on every mutated file and confirm no mutation remains — an interrupted restore otherwise ships the bug.

**Fresh-context oracle for tricky logic.** When a fix touches genuinely tricky logic (parsing, encoding/decoding, date/boundary math, ordering), spawn one agent that is given ONLY the function's contract (signature + doc/spec, not the implementation, not the assertions) plus the test inputs, and asked to independently derive the expected outputs. Compare against the test's assertions. A mismatch means either the test or the implementation encodes the same bug — investigate before trusting the green run.

## Summary

Calling commands rely on these three lists, so always give all three, writing "none" for an empty one:

- **Fixed**: briefly, what was fixed, and which reviewers ran or were skipped. Group security findings by severity (critical, high, medium, low) and say how many findings the refutation pass rejected. Include a dead-code line from the Reuse & Structure reviewer's script run: `none new`, `n deleted`, `tool error: …`, or `not run`. Confirm the code was clean if no issues were found.
- **Needs a decision**: the three exceptions above, each with its finding and proposed fix; any `confirmed` security finding left unfixed, with its severity; and `needs_validation` leads with no severity, each with its missing fact and the owner's check.
- **Couldn't verify**: the agents' Couldn't-verify lists as one short section, without duplicates, so the gaps are visible rather than read as a clean pass.
