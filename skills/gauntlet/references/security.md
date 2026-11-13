# Security Review

Review the same changes for security vulnerabilities.

**Method (before the checklist):**
- Trust the code, not the narrative. Commit messages, PR titles, and comments may be incomplete or misleading — follow the actual changed code path.
- Stay anchored to the diff, but follow it far enough: trace changed code to the sinks and guards it reaches. If the diff changes a shared helper, guard, sanitizer, or sink wrapper, check the sibling call sites that change affects — unchanged siblings are context/negative controls, not scope creep.
- Every finding needs a complete proof tuple: **attacker-controlled source → missing/bypassed/incomplete closest control → dangerous sink → concrete impact**. If you can't articulate all four, it's not a finding — don't report generic "needs more validation" comments with no exploit path.
- When a dangerous sink has multiple independently reachable call sites, report each one — don't collapse them into one finding, and don't let one loud finding close out a quieter separate one in the same flow.
- The weakest door counts. For each changed operation, find every other route to the same effect (retry, batch, queued, legacy, error path) and compare their controls for equivalence, not just presence.
- Compare guarantees at handoffs: what component A actually guarantees against what B assumes (truncation, type coercion, normalization, scope). That includes second-order use, where data that was safe when stored later becomes a path, URL, regex, template or raw HTML.
- Check the sad states. With config missing, a flag off, a dependency down or a migration half-done, does the path fail closed? Try absent, empty, duplicate, stale, revoked, reordered and concurrent values where the interface accepts them.
- After a Critical or High finding, search the touched code and its siblings for lexical, structural and logical variants of the same root cause. Establish each variant's conditions and impact separately.

**Verdicts (every candidate gets exactly one):**
- `confirmed`: the proof tuple is complete from source or a local check. Gets a severity.
- `needs_validation`: the tuple is complete except for one decisive fact the repo can't show (hosting or deployment protection, proxy or CDN behavior, IdP policy, branch protection, provider settings, production env). Name the exact missing fact and how the owner can observe it. No severity, no guessing either way, and never probe production to settle it. This is not a parking place for speculation.
- Rejected: the source disproves it. Don't report it.

**Not counterevidence** (don't suppress a finding because of these):
- An optional, empty-by-default, or operator-configured filter/allowlist
- Validation that runs before redirects but not on the final destination
- Frontend-only constraints on values an API/webhook can supply directly
- The API being deprecated, opt-in, or documented as dangerous (that's a precondition, not a defense)
- A safe sibling code path (that clears the sibling, not this instance)
- A later business-logic check, unless it provably defeats this exact path

**Injection & Input Validation:**
1. **SQL injection**: raw string concatenation in queries — use parameterized queries
2. **Command injection**: user input in shell commands, `exec`, `system`, `child_process`, `subprocess` — sanitize or avoid shell execution
3. **XSS**: user-controlled data rendered without escaping — use framework-provided escaping (React JSX, ERB `h()`, Django `|escape`)
4. **Path traversal**: user input in file paths — reject `..`, use `path.resolve` with a base directory. Includes archive extraction (zip-slip): each member name must be normalized and contained *before* the write, not filtered afterward
5. **Deserialization**: untrusted data in `eval`, `pickle.loads`, `Marshal.load`, `unserialize`, YAML unsafe loaders
6. **Template injection (SSTI)**: user input concatenated into server-side templates or passed to template engines as the template itself rather than as data
7. **XXE / unsafe XML parsing**: XML parsers processing untrusted input without external entities and DTDs disabled — hardening must fail closed on the exact parser instance used

**Authentication & Authorization:**
8. **Hardcoded secrets**: API keys, passwords, tokens in source code — use environment variables or secret management
9. **Missing authorization**: endpoints or actions without permission checks — every state-changing operation needs an authz check
10. **IDOR**: accessing resources by ID without ownership verification
11. **CSRF**: state-changing requests carried by an ambient credential (a cookie) with no effective CSRF token, same-site binding or Origin check. Read-only actions and bearer-only routes don't qualify.
12. **Session/JWT issues**: weak tokens, missing expiration, `alg: none`, no invalidation on logout
13. **Validated-vs-consumed mismatch**: token/assertion/object validated in one place but a *different* one used afterward (validation loop sets a flag, then code takes the first/fixed-index element); self-service updates that check one field alias but let a sibling field change identity, roles, or recovery properties

**Data Exposure:**
14. **Sensitive data in logs**: passwords, tokens, PII logged or in error messages — redact before logging
15. **Weak cryptography**: MD5/SHA1 for passwords (use bcrypt/scrypt/argon2), `Math.random` for security (use crypto-secure RNG)
16. **Mass assignment**: accepting all user fields without allowlisting — use strong params, DTOs, or explicit field picking
17. **Information disclosure**: stack traces, debug info, internal paths exposed to users in production

**Infrastructure & Logic:**
18. **Race conditions**: TOCTOU bugs, missing locks, non-atomic read-modify-write
19. **DoS vectors**: unbounded loops/recursion on user input, ReDoS-vulnerable regexes, unlimited upload sizes, missing rate limiting
20. **SSRF**: user-controlled URLs fetched server-side — restrict to expected hosts, block internal IPs, and constrain the *final* destination (after redirects), not just the first URL
21. **Open redirects**: user input in redirect URLs without allowlist validation
22. **Error handling gaps**: bare `except`/`catch` swallowing security exceptions, user enumeration via differing error messages

**Platform & Delivery:**
23. **Non-constant-time secret comparison**: `==`/`===` on API keys, bearer tokens, HMACs or webhook signatures — use `crypto.timingSafeEqual`, `secure_compare` or the framework equivalent
24. **CI as authorization code**: establish which event triggered the workflow, whose code runs, and what secrets and tokens it holds. Flag `pull_request_target`/`workflow_run` jobs that run PR-controlled code with secrets or write tokens, and attacker-controlled branch names, titles or comments reaching `run:` through `${{ }}`. Over-broad permissions alone aren't a finding; show the reachable privileged action.
25. **Webhook provenance and replay**: the signature is verified over the raw body before any field is trusted, body fields aren't used as the sender's identity, and a duplicate delivery can't repeat a side effect that isn't idempotent
26. **Host and forwarded-header trust**: `Host`, `X-Forwarded-*` or `Origin` feeding absolute URLs, reset links, callbacks, tenant routing or an IP-based auth decision. Confirm who can supply the header; if that depends on the proxy, it's `needs_validation`.
27. **Private responses cached**: a response that varies by identity or authorization while the CDN or framework cache key omits it
28. **Operator spend and pre-auth work**: an input-to-cost path where paid API or LLM calls, fan-out or expensive parsing are reachable before auth or have no effective bound. Check body caps, concurrency, deadlines and quotas before calling it unbounded, and name the impact on a shared service or the operator's bill.

**AI/LLM & MCP (only when the diff touches prompt assembly, model calls, tool handlers, MCP servers or clients, RAG or agent memory).** Follow untrusted content → model or memory → capability, authority or sink.

Prompt injection alone isn't a finding. Require a code-level boundary failure: the content reaches another principal's context, invokes authority the requester lacks, discloses data they can't read, drives a sink they can't reach, or causes an action nobody requested. A guardrail prompt isn't a control: count only deterministic checks, resource-scoped authorization, isolation, binding and constrained credentials. Model output, memory, tool descriptions and MCP responses are all untrusted input.

- **L1. Action binding**: attacker-controlled content (a ticket, email, issue, document) causes a side effect under a victim's valid authority without the victim's intentional request or approval. Generic authorization passing doesn't clear this. Where there's an approval step, it must bind the tool, the complete arguments, the requester and the target, and a retry or resumed session can't reuse it for a changed or duplicate action.
- **L2. Tool-argument injection**: model-produced arguments reach SQL, shell, file, URL-fetch or privileged APIs without handler-side validation. A tool schema narrows shape only; it doesn't establish authorization, safe paths, safe URLs or query semantics. Compare what the schema accepts (aliases, extra fields, coercions) with what the handler uses.
- **L3. Excessive agency and confused deputy**: a tool runs under a broad service credential and its handler doesn't re-check the requester's permission on the named resource, or a new tool is granted to a principal automatically. A shared credential with enforced per-user scope isn't a defect.
- **L4. Indirect injection through ingested content**: trace who can write each source (tickets, email, issues, RAG documents, tool responses), how retrieval scopes it, whose session consumes it, and what capability that session has.
- **L5. Insecure output rendering**: model output reaches HTML, Markdown, URL, template or command sinks without the encoding that sink needs, including auto-loaded images and links that can carry data out.
- **L6. Sensitive context extraction**: the assembled context holds credentials or another user's data and user-influenced output can expose it. Revealing generic instructions isn't a finding.
- **L7. Context bleed and memory poisoning**: conversation history, retrieval results, prompt caches or memory keyed too broadly, or low-trust content written into durable memory. Cite both the attacker-controlled write and the later cross-principal read or privileged decision.
- **L8. Unbounded delegated loops**: a bounded request can queue repeated spend, sends or mutations with no per-request budget, cancellation or idempotency.
- **L9. Sub-agent and MCP trust inheritance**: a delegated task receives the full session or credentials instead of the least authority it needs; delegated results are trusted on return; or peer-supplied tool descriptions and metadata are treated as policy instead of an allowlist and handler authorization.

**Severity calibration (every `confirmed` finding gets one; `needs_validation` gets none):**
- **Critical/High** require a realistic in-scope attacker path AND material impact (RCE, auth bypass, account takeover, cross-tenant access, secret exposure) — not just a scary bug class or dangerous-looking sink. If justifying the severity takes a long speculative chain, downgrade it.
- Downgrade when the path is self-only, localhost-only, requires privileges the attacker would already need, or depends on unrealistic preconditions.
- Missing headers/cookie flags, version disclosure, user enumeration, and open redirects alone are Low unless part of a demonstrated chain.
- A real bug with no security consequence goes to the Code Quality reviewer's pile, not the security report.
- When effort is constrained, spend it in impact order: command/code execution → deserialization → SSTI → SQL/query injection → SSRF → path traversal/file write → upload handling → authz/tenant bypass → data exposure/config.
