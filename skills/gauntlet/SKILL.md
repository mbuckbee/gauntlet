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

**Dependency scan first.** Unless the diff is docs-only, run `${CLAUDE_SKILL_DIR}/scripts/osv-deps --base origin/main`, adding `--head <ref>` when Phase 1 used a range (`--base` and `--head` are its two ends). It skips itself when no lockfile changed. Otherwise it checks the changed lockfiles' packages against Google's OSV database (a few seconds, read-only) and splits the advisories into ones the diff `introduced` and ones that were `pre_existing`. Paste its JSON into the Security reviewer's prompt. If it prints `{"skipped": …}`, carry on without it. If it prints `{"error": …}`, or its `errors` list isn't empty, carry on and list each lockfile that wasn't scanned under **Couldn't verify**.

Use the Agent tool to launch every reviewer that applies concurrently in a single message. If an agent is refused (e.g. the concurrent-subagent limit), read that reviewer's file and run it inline; don't retry the launch.

**Each agent's prompt contains:**

1. "Read `${CLAUDE_SKILL_DIR}/references/<name>.md` and follow it." Add: "The skill directory is `${CLAUDE_SKILL_DIR}`; wherever your file says `<skill dir>`, use that path." Don't paraphrase or summarize the file into the prompt; the agent reads it whole.
2. The diff command from Phase 1 (the agent runs it) and the changed-file list.
3. The path to the repo's `REVIEW.md`, if there is one.
4. The four rules below, verbatim.

**The four rules:**

- **No alibi.** Leave out the conversation, the user's request, and your reasoning for the change. The reviewer is useful because it never heard why the shortcut seemed fine. Commit messages and comments are code under review, not explanations to trust.
- **Hunt, don't approve.** Open the agent's instructions with: "Assume this diff has at least one real defect in your lane. Find every way it breaks that you can back with the input or state that triggers it, most likely first. Don't invent findings: if you find none, say so. End with a **Couldn't verify** list of what your lane should cover but you couldn't check from here (a page you couldn't render, a caller outside the repo, a path that needs production data)." An empty report with an empty Couldn't-verify list is not acceptable.
- **Report, don't edit.** Reviewers change no files. They run in parallel on one working tree, and all fixes happen in Phase 3.
- **Grade by harm.** Tag every finding `Important` or `Nit`. `Important` means it would hurt in production: wrong behavior a user or operator would hit, lost or corrupted data, an outage, a missed alert, a broken page. Everything else is a `Nit`: an edge case that needs a hand-crafted input, a test gap over code that is already correct, a refactor, a style point. Add `Pre-existing` only when the problem was already reachable before the diff. If the old lines are unchanged but the diff makes them wrong (it adds a caller, a new input, or a step before or after them that changes what they mean), the diff introduced the problem: grade it on its harm with no `Pre-existing` tag. Example: an existing `.limit(10)` becomes a bug once the diff adds a step that sums the limited rows into totals. The Security reviewer uses its own severities instead; Critical, High and Medium count as Important.

## Phase 3: Fix Issues

Wait for every launched agent to complete.

**Refute before fixing.** Give every `Important` finding, and every `confirmed` security finding of Medium severity or above, to its own fresh agent, in parallel, before anything gets fixed. `Nit` findings skip this step. Each refuter receives one finding and the file paths, and follows the no-alibi rule. Open its prompt with: "You did not write this finding. Try to refute it from the source." It edits nothing. It may run read-only commands and existing tests.

- **Security finding:** it re-reads every cited line, confirms the entry point is really attacker-reachable and the sink is real, reconstructs the strongest control on the path, and checks that the severity doesn't exceed the demonstrated impact. Verdict: `confirmed` (with any corrected severity or wording), `needs_validation` (with the exact missing fact), or `rejected` (with the reason).
- **Any other finding:** it re-reads every cited line and traces the stated trigger from a real entry point to the failure. It looks for whatever already prevents it: a guard, a validation, a caller that never passes that input, a test that covers it. It then checks the grade against the harm it could demonstrate. Verdict: `confirmed`, `downgraded` (real, but a `Nit` by the grading rule), or `rejected` (with the reason).

**A failing test with every confirmed verdict.** A refuter that can't disprove a finding returns a reproduction: one test, written in the repo's test framework and style, that fails on the current code because of the defect and will pass once it's fixed. It gives the file path to put it in, the full test code, and the command that runs only that test. It doesn't create the file: refuters run in parallel and edit nothing. When no practical test exists (a rendered-page behavior, infrastructure, a race that needs real concurrency), it says so and gives the reason, and the verdict rests on its reading of the source.

Rejected findings are dropped. Downgraded findings are fixed like any other `Nit`.

**Reproduce, then fix.** Take the confirmed findings one at a time. Write the refuter's test, run it, and watch it fail before touching the code under test. Then fix the defect and run the test again. It stays in the suite as the regression test.

- If the test fails for an unrelated reason (a typo, a missing fixture), correct the test and run it again.
- If a correct test passes against the unfixed code, the finding wasn't reproduced. Delete the test, don't fix the finding, and list it under **Couldn't verify** as not reproduced, with what the test tried.
- For a security finding, re-check the proof tuple before dropping it. A passing test can mean the test missed the path, and a hole left open costs more than a wasted fix.

**Then run the properties, before the remaining fixes.** Write every property test the Test Coverage reviewer specified, except those whose finding refutation rejected, and run each against the code as it stands. Properties check the code with inputs nobody picked by hand, so they're the cheapest check here that doesn't share the reviewers' blind spots. After the structural fixes below, update any property whose target was renamed, moved or re-signatured, and run all of them again before the mutation check.

- A property that passes stays in the suite. It still goes through the mutation check below.
- A property that fails: shrink the counterexample to the smallest input that still fails (with no library shrinker, drop elements and halve values by hand while it keeps failing). Then check that input against the code's intended contract before touching anything.
  - **The code is wrong:** add the counterexample as a named example-based case next to the property and treat it as a confirmed `Important` finding (unless the harm is clearly a `Nit`). Merge it with any reviewer finding for the same defect, and count it in the post-refutation totals. The failing test is the reproduction, so fix the code.
  - **The property looks wrong** (the code's behavior seems intended): you probably wrote that behavior, so don't rule on it alone. Send a fresh refuter only the counterexample and the contract, not the implementation or this conversation. On `rejected` (the behavior is intended), fix the property and say in the summary what it got wrong. Otherwise treat it as the code being wrong. Never loosen a property just to make it pass.
- **A failing property on a security predicate** (a guard-boundary property, or any auth, allowlist, path, URL or escaping check) is a security finding: give it a Critical/High/Medium/Low severity, report it in the security group, and use the security refuter for the check above. On `confirmed`, fix the code. On `needs_validation`, list it under **Needs a decision** as a lead with its missing fact and the counterexample, like other leads. Never rewrite such a property on your own judgment.

Aggregate the findings that survive and fix ALL issues directly — including pre-existing issues in the changed files, not just issues introduced by the current diff. The exception is UI drift: fix only what the diff introduced. `needs_validation` leads are reported, not fixed, because the fact that would justify the fix is still unknown. Structural findings get fixed like any other; if one turns out not to be contained after all (see the Reuse & Structure reviewer's rule), drop it rather than listing it as a follow-up. Fix it after the smaller findings and before writing the remaining new tests (reproductions and properties came earlier), so the tests cover the final shape. For the other test-coverage findings (property findings were handled above), write the missing tests and fix the bad ones, then run the test suite to confirm they pass. If you can see it and it's a real problem, fix it. Everything reversible inside the codebase gets fixed, with three exceptions that go under **Needs a decision** instead:

- **Infrastructure-level changes** (e.g., rate limiting at the load balancer): note those briefly.
- **Fixes that add surface**: a new dependency, external service, permission or OAuth scope, outbound network call, or environment variable, and a dependency bump that crosses a major version. Don't apply those quietly. List the finding and the proposed fix so the user decides.
- **Policy files.** Don't change `REVIEW.md`, `CLAUDE.md` or `AGENTS.md` rules as a review fix; list the suggested change. The exception is a diff whose own purpose is to change them, unless the caller said not to edit policy files.

**Re-run rendered findings.** After fixing a rendered Accessibility finding, repeat its reproduction steps in the browser and confirm the behavior changed. A green test suite doesn't prove a focus or contrast fix.

**Prove each new test can fail.** A test that has only ever passed proves nothing. A reproduction test already failed before its fix, so it's exempt. For every other test you add: introduce a deliberate one-line mutation in the code under test via the Edit tool (flip a comparison, off-by-one a bound, swap arguments), run that test, confirm it FAILS, then Edit the mutation back and confirm it passes. Forward-only edits — never use git to revert. If a new test passes against the mutated code, the test is tautological; rewrite it before moving on. Before reporting done, run `git diff` on every mutated file and confirm no mutation remains — an interrupted restore otherwise ships the bug.

**Fresh-context oracle for tricky logic.** When a fix touches genuinely tricky logic (parsing, encoding/decoding, date/boundary math, ordering), spawn one agent that is given ONLY the function's contract (signature + doc/spec, not the implementation, not the assertions) plus the test inputs, and asked to independently derive the expected outputs. Compare against the test's assertions. A mismatch means either the test or the implementation encodes the same bug — investigate before trusting the green run.

## Summary

Calling commands rely on these three lists, so always give all three, writing "none" for an empty one:

- **Fixed**: briefly, what was fixed, and which reviewers ran or were skipped. Group security findings by severity (critical, high, medium, low) and say how many findings the refutation pass rejected and how many it downgraded. Give the count of Important and Nit findings after refutation. Add a properties line: how many property tests were written, and how many failed on first run (each with the counterexample and whether the code or the property was fixed), or `not run (Test Coverage skipped)`. Include a dead-code line from the Reuse & Structure reviewer's script run: `none new`, `n deleted`, `tool error: …`, or `not run`. Confirm the code was clean if no issues were found.
- **Needs a decision**: the three exceptions above, each with its finding and proposed fix; any `confirmed` security finding left unfixed, with its severity; and `needs_validation` leads with no severity, each with its missing fact and the owner's check.
- **Couldn't verify**: the agents' Couldn't-verify lists as one short section, without duplicates, so the gaps are visible rather than read as a clean pass.
