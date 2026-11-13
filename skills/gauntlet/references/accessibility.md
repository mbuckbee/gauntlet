# Accessibility Review (only when the diff touches UI)

**Trigger:** same as the UI Drift reviewer. It runs alongside the UI Drift reviewer, not instead of it.

Focus order, focus traps, contrast and dialog behavior only exist once the page renders. A reviewer that only reads the diff is judging Tab from hearsay. So this lane has two passes, and the rendered pass is the main one.

**Scope:** elements rendered by files the diff touches. Report pre-existing problems in those components too (the fix phase fixes them like any other pre-existing issue in a changed file), but not problems elsewhere in the page's layout.

**Static pass** (from the diff and the `a11y_*` entries in the lint JSON):

- **A1. Images without `alt`** (decorative images need `alt=""`).
- **A2. Buttons and links with no accessible name**: icon-only or empty, with no text, `aria-label` or `aria-labelledby`.
- **A3. Inputs without a label**: no `<label for>`, wrapping label, or `aria-label`.
- **A4. ARIA that lies**: a `role` without the keyboard behavior it promises (`role="button"` on a `div` with no Enter/Space handler or `tabindex`), `aria-labelledby`/`aria-describedby` pointing at an id that doesn't exist, toggles that never update `aria-expanded`/`aria-pressed`/`aria-selected`, `tabindex` greater than 0, `outline: none` with no `:focus-visible` replacement.
- **A5. Labels that mislead**: a placeholder used as the only label; an `aria-label` that doesn't contain the visible text (voice-control users say what they see); radio or checkbox groups with no `<fieldset>`/`<legend>` or `role="group"` name; repeated controls with identical names ("Remove", "Edit") and nothing saying which row they act on; an error message not tied to its input with `aria-describedby` or `aria-errormessage`.
- **A6. Wrong control for the job**: a clickable `div`/`span` instead of a `<button>`; a link (`<a href="#">`, `link_to` with JS) that performs an action, or a button that navigates; a `<button>` inside a form with no `type` that submits by accident; a disabled control with no text saying why.
- **A7. Screen-reader structure**: the page needs one `<main>` and landmarks for nav and search, and headings with no skipped levels. VoiceOver users jump through the page by landmark and heading. Content that updates in place (Turbo frame or stream replaces, toasts, inline save results, polling status) needs an `aria-live`/`role="status"` region that already exists in the DOM before the update, or the change is never announced.

**Rendered pass.** Use a dev server that's already running: check the project's CLAUDE.md for its URL, or `lsof -iTCP -sTCP:LISTEN -P` for a local web port. If none is running and CLAUDE.md documents a dev command, you may start it in the background. Never restart or kill a running server. Load the browser tools in one call (`ToolSearch` with `select:mcp__chrome-devtools__new_page,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__press_key,mcp__chrome-devtools__click,mcp__chrome-devtools__take_snapshot,mcp__chrome-devtools__take_screenshot,mcp__chrome-devtools__evaluate_script,mcp__chrome-devtools__close_page`), open your own page, and close it when done. If a route redirects to a login, don't enter credentials: test what's reachable and put the rest under Couldn't verify. If nothing can be rendered, do the static pass and put "rendered pass skipped: <reason>" at the top of Couldn't verify.

For each route that renders the changed components:

- **R1. Keyboard walk.** From the top of the page, press Tab repeatedly and read `document.activeElement` after each press (`evaluate_script`). Every control the diff added must be reachable. Order must follow the visual order. Focus must be able to leave every region (no trap outside an open modal). Each focused element needs a visible indicator: its computed `outline`/`box-shadow` under focus isn't `none`, and the indicator has 3:1 contrast against its surroundings.
- **R2. Dialogs, menus and disclosures.** Open each one the diff adds or changes with Enter or Space, not a click. Focus moves inside. In a modal, Tab and Shift+Tab stay inside. Escape closes it, and focus returns to the control that opened it. That round trip is the check static lint misses most.
- **R3. Contrast from computed styles.** For text the diff adds, read computed `color` and the effective background (walk up ancestors until one is opaque). Require 4.5:1 for normal text and 3:1 for large text (≥24px, or ≥18.66px bold) and for control boundaries. Check hover, focus and disabled states, plus dark mode if the project has one.
- **R4. Accessibility tree.** `take_snapshot` and confirm each new control's computed role and name match what it does. This catches names lost through CSS, a broken `aria-labelledby`, or a heading level that skips.
- **R5. axe-core.** Inject `https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js` with `evaluate_script`, run `axe.run()` scoped to the changed components' root selectors when you can identify them, and report `serious`/`critical` violations on those elements. If the page's CSP blocks the script, say so under Couldn't verify.
- **R6. Focus after dynamic changes (VoiceOver focus).** For each action the diff adds that changes the page without a full load (Turbo frame replace, form submit with an inline result, deleting a row, closing a toast), trigger it with the keyboard and read `document.activeElement` afterward. Focus must land somewhere meaningful (the new content, the next row, the result message) and never fall back to `<body>`, which sends VoiceOver to the top of the page. Also confirm the live region from A7 holds the new text (read its `textContent`).

Each finding gives the route, the element (selector or accessible name), what happened versus what should happen, and a contained fix in the diff's files. For a rendered finding, say how you reproduced it ("Tab ×6 from page top, Enter, Esc → focus on `<body>`") so the fix phase can re-run it.
