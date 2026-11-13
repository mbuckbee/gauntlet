// ui-drift-js flat config. Run only via run.mjs (overrideConfigFile, no
// config lookup), so the target repo's ESLint config and plugins never load.
// Every rule maps to a /gauntlet UI Drift reviewer check or Accessibility reviewer A1-A3; everything else is off.
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";
import astro from "eslint-plugin-astro";
import astroParser from "astro-eslint-parser";
import uiDrift from "./lib/eslint-plugin.js";

const A11Y = [
  "alt-text", // Accessibility A1
  "img-redundant-alt", // Accessibility A1
  "anchor-has-content", // Accessibility A2
  "control-has-associated-label", // Accessibility A2 (icon-only buttons)
  "label-has-associated-control", // Accessibility A3
];
// anchor-has-content already covers <a>; don't double-report it. Table cells
// aren't controls, and form fields labelled by a separate <label htmlFor> are
// invisible to this rule, so the
// rule only covers buttons and ARIA-role controls; the Accessibility reviewer's A3 reads inputs.
const OPTIONS = {
  "control-has-associated-label": {
    ignoreElements: ["a", "tr", "td", "th", "input", "select", "textarea"],
  },
};
const a11y = (prefix) =>
  Object.fromEntries(A11Y.map((r) => [`${prefix}${r}`, OPTIONS[r] ? ["warn", OPTIONS[r]] : "warn"]));

// Selectors whose messages run.mjs maps to check names (prefix before ':').
const SVG = { selector: "JSXOpeningElement[name.name='svg']", message: "inline_svg: inline <svg>" };
const STYLE_ATTR = {
  selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='style']",
  message: "inline_style: style attribute",
};

const shared = {
  "ui-drift/emoji-icon": "warn", // check 16
  "ui-drift/raw-color-attr": "warn", // check 2 (markup)
};

export default [
  {
    linterOptions: { reportUnusedDisableDirectives: "off", noInlineConfig: true },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { react, "jsx-a11y": jsxA11y, "ui-drift": uiDrift },
    settings: { react: { version: "19.0" } },
    rules: {
      ...shared,
      ...a11y("jsx-a11y/"),
      "react/forbid-dom-props": ["warn", { forbid: ["style"] }], // check 1
      "no-restricted-syntax": ["warn", SVG], // check 15
    },
  },
  {
    files: ["**/*.astro"],
    languageOptions: {
      parser: astroParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: [".astro"], sourceType: "module" },
    },
    plugins: { astro, "ui-drift": uiDrift },
    rules: {
      ...shared,
      ...a11y("astro/jsx-a11y/"),
      // react/forbid-dom-props doesn't apply to Astro templates; same check via selector.
      "no-restricted-syntax": ["warn", SVG, STYLE_ATTR], // checks 15 and 1
    },
  },
];
