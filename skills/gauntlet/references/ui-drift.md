# UI Drift Review (only when the diff touches UI)

**Trigger:** the diff touches templates or components (`.jsx/.tsx/.vue/.svelte/.astro/.erb/.html`, `app/views`, `app/components`, `components/`), stylesheets, design tokens, or client-side behavior files. Otherwise don't launch it.

**Lint JSON.** Before launching you, the orchestrator ran `<skill dir>/scripts/ui-drift-rails --base origin/main --head HEAD` (Rails repos) or `<skill dir>/scripts/ui-drift-js` (everything else) and pasted its JSON into your prompt, minus the `a11y_*` entries, which go to the Accessibility reviewer. If your prompt has no JSON, run the script yourself: it takes a few seconds and is read-only because it lints a `git archive` export. `ui-drift-rails` runs the [`ui_guardrails`](https://github.com/meticulous/guardrails) sidecar at `~/.claude/vendor/guardrails` (or `$GUARDRAILS_DIR`). `ui-drift-js` runs its own ESLint/stylelint config from `<skill dir>/ui-lint` (never the repo's) over JSX/TSX, Astro and CSS/SCSS. Both keep only drift the diff introduced (added line, drift string not on the hunk's removed lines, line not moved). Their findings are exact candidates for checks 1–3 and 8–16 (`ui-drift-js` covers 1, 2, 15, 16) and for the Accessibility reviewer's A1–A3 (the `a11y_*` entries). `raw_color` entries are candidates only: whether a token exists and is in scope is the agent's call. Lines the diff merely moved (removed verbatim elsewhere in the diff, e.g. markup extracted into a new partial) are already dropped, so relocated old drift never shows up. The UI Drift reviewer still applies scope, exemptions and fix-or-drop to each one, e.g. `inline_svg` drops when the icon system lacks the glyph, but four identical new spinners are a check 13 finding. `classitis`/`repeated_markup` entries list the diff's own occurrences in `added_at`; fix only those. If it prints `{"skipped": …}`, carry on without it.

The checks are a framework-agnostic port of the static detectors in [`meticulous/guardrails`](https://github.com/meticulous/guardrails) (`ui_guardrails` gem, MIT). They target the drift AI-assisted code piles up faster than design-system discipline keeps up. Work out the project's conventions first, then judge the diff against them:

- **Styling system**: detect it, don't assume it. Tailwind, CSS Modules, plain CSS/SCSS, CSS-in-JS. Checks that don't apply to it (e.g. 3 and 14 without utility classes) are skipped.
- **Token sources**: CSS custom properties, SCSS variables, `tailwind.config.*` theme, Tailwind v4 `@theme {}`, JS/TS theme objects. Tokens the diff itself defines count; their definition blocks are exempt from check 2.
- **Shared UI primitives**: Button/Link/Card/Icon components, partials, ViewComponents, helpers.
- **Icon system**: sprite, icon component, or an icon library such as `lucide-react`.
- **Story/preview convention**: Storybook, Lookbook, or none.

**Scope: only what this diff introduced.** Old drift in a touched file is not this PR's to fix; a mature codebase can have hundreds of these findings, and fixing them all buries the change. Every finding cites a line the diff added, and the drift itself must be new: if the same class, style or color string is on the line's removed (`-`) counterpart, the line was rewritten for another reason and carried old drift along — skip it.

**Exempt:** markup that deliberately mimics someone else's UI (demos of a prospect's product, third-party brand look-alikes, embedded vendor widgets). Their colors and icons are content, not drift.

**Fix or drop**, same rule as the Reuse & Structure reviewer: each finding comes with a concrete fix that stays within the diff's files (or a component they extract into). One extra allowance here: an additive, optional prop on a shared primitive (e.g. passing `className` or `aria-hidden` through an icon component) counts as contained. If there's no contained fix — no matching token, no existing primitive — drop it. Server-side primitives (Ruby helpers, partials) aren't a fix for markup built in client-side JS templates.

**Token bypass:**
1. **Inline styles**: `style="…"` / `style={{…}}` / `:style` carrying static visual values (color, spacing, type, radius). Values computed from data are dynamic and exempt, even when they're colors (`background-color: ${rule.color}`).
2. **Raw colors**: hex/`rgb()`/`hsl()` literals in markup, color-bearing attributes (`fill`, `stroke`, `color`, `data-*color*`), or stylesheets outside the token definitions. Name the matching token: exact match first, else a near match within ~4 per RGB channel. An alpha variant of a token's color (`rgba(<token rgb>, .55)`) maps to `color-mix(in srgb, var(--token) 55%, transparent)`. The token must actually be in scope at that element: a custom property scoped to another selector, or a stylesheet this route's layout never loads, doesn't count. Moving a diff-defined token block to a wider scope within the same file is a contained fix.
3. **Arbitrary utility values**: Tailwind-style `bg-[#fa3]`, `text-[14px]`, `p-[7px]` where a theme value exists. Name the theme class.

**Primitives** (checks 4–6 moved to the Accessibility reviewer as A1–A3; the numbers stay so the lint scripts' references hold):

7. **Raw elements where the project has a primitive**: a hand-rolled `<button>`/`<a>` (or framework equivalent) when a shared Button/Link component or helper exists and handles naming, focus and variants.

**Wiring orphans:**

8. **Behavior references with no definition**: e.g. `data-controller="foo"` with no `foo_controller`, an `x-data`/directive/hook name nothing defines, or an event handler prop pointing at nothing.
9. **Definitions the diff leaves unreferenced**: a client controller, hook or component the diff stopped using and that nothing else uses. Delete it.
10. **Declared but unused component API**: a slot, prop, or `renders_one`/`renders_many` the component declares but its template never renders.
11. **New component with no story/preview**, only if the project already keeps them for its components.

**Markup duplication** (hand these to the same fix-or-drop bar as the Reuse & Structure reviewer's structural checks):

12. **Near-duplicate components/partials**: a new template whose tag structure largely matches an existing one (guardrails flags ~70% n-gram overlap of the tag stream). Parameterize the existing one instead.
13. **Repeated markup shape**: the same element subtree (≥5 elements) appearing 3+ times including the diff's copies. Extract a component or partial.
14. **Class soup**: the same tag with the same set of ≥5 utility classes in 3+ places. Use the existing component, a variant, or one `@apply`/class recipe.

**Icons:**

15. **Inline `<svg>` icons that the icon system already has** (same glyph in the sprite, icon component, or installed library). Use it. A glyph the system lacks isn't a finding, even if inline SVG is common elsewhere.
16. **Emoji or dingbat glyphs as UI icons** (`📄`, `✓`, `→`, `★`, `⚠`) in templates, helpers, client code or locale strings. Swap in the icon system's equivalent. Copy is not an icon: letters, digits, punctuation, currency, `©®™`, ellipsis, dashes and quotes are fine, as is emoji that is user content.

Out of scope: accessibility (the Accessibility reviewer) and rendered visual regressions. This lane is static reading only.
