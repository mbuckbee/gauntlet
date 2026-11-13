# Test Coverage & Quality Review

Answer two questions about the diff: **is the new functionality sufficiently tested**, and **are those tests actually good**? Start by naming the 2–3 riskiest behaviors in the diff — tricky logic, parsing, boundary math, auth, concurrency — and weight your findings there; a uniform sweep that spends equal effort on trivial and risky code misses where bugs actually live. Then locate the tests that correspond to the changed code (same-name test files, `test/`, `spec/`, `__tests__/`, co-located `.test.*`/`.spec.*` files) — read them, don't assume.

**Coverage — is anything untested?**
1. **New behavior with no test at all**: every new public function, endpoint, component behavior, or branch of business logic in the diff should have at least one test exercising it. Map each changed unit to its tests; report the ones with none.
2. **Changed behavior with unchanged tests**: if the diff alters logic but no test file changed, either the tests are too loose to notice (bad) or the behavior is untested (also bad) — flag it either way.
3. **Edge and failure paths**: error handling, empty/null inputs, boundary values, timeouts, and rejected promises introduced in the diff need tests too, not just the happy path. New guards/validation deserve a test proving they reject bad input.
4. **Regression anchors**: if the diff fixes a bug, there must be a test that fails on the old code and passes on the new — otherwise the bug can silently return.
5. Calibrate: don't demand tests for trivial passthroughs, generated code, pure config, or one-line delegation. Report *material* gaps, ranked by the risk of the untested code breaking silently.

**Quality — are the existing/new tests good?**
1. **Tautological tests**: tests that mock the unit under test, assert the mock was called with what it was stubbed to return, or restate the implementation — these pass no matter what and are worse than no test.
2. **Testing implementation, not behavior**: asserting on private state, internal call order, or exact markup/snapshots when the contract is the observable output. These break on refactors and pass on real bugs.
3. **Over-mocking**: so many collaborators stubbed that no real code path runs. Prefer real objects for cheap in-process collaborators; mock only true boundaries (network, clock, filesystem, third-party APIs).
4. **Weak assertions**: `assert result` / `toBeTruthy()` / "doesn't throw" where a specific expected value exists; asserting only part of the result when the rest matters.
5. **Nondeterminism**: reliance on wall-clock time, real network, sleep-based waits, iteration order, or shared mutable state between tests — flaky tests train people to ignore failures.
6. **Missing negative space**: tests that only confirm the feature works, never that it correctly refuses/fails (authz denied, validation rejects, error surfaces to the caller).
7. **Test hygiene**: misleading test names, dead/skipped tests touching the changed code (`xit`, `skip`, commented-out), copy-pasted tests that don't vary the thing their name claims to test.
8. **Degenerate inputs**: test inputs too symmetric or uniform to tell a correct implementation from a plausibly-wrong one — palindromes in roundtrip/reversal tests, all-same-value buffers, identical values on both sides of a swap, zero where sign matters. Ask: would this input still pass if the implementation reversed the order, swapped the arguments, or was off by one? If yes, flag it.

For each finding, state what's untested or wrong, why it matters (what real bug would slip through), and the specific test to add or fix — concrete enough that the fix phase can write it. Don't pad the report with praise for covered areas; a short "covered adequately: X, Y" line is enough.
