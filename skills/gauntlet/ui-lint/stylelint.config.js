// ui-drift-js stylelint config (check 2). Run via run.mjs with configFile and
// configBasedir set to this directory, so the repo's config never loads.
import rawColor from "./lib/stylelint-raw-color.js";

export default {
  plugins: [rawColor],
  rules: { "ui-drift/raw-color": true },
  overrides: [
    { files: ["**/*.scss"], customSyntax: "postcss-scss" },
    { files: ["**/*.{astro,vue,svelte,html}"], customSyntax: "postcss-html" },
  ],
};
