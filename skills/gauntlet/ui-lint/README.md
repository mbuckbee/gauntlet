# ui-lint sidecar

Review-time ESLint/stylelint config for `../scripts/ui-drift-js`. It never reads the target repo's own lint config.

Install once: `npx npm@11 ci` in this directory (npm 10 strips the lockfile's `libc` fields). After an upgrade, run `npm test`.

Pins and why:
- eslint 9, not 10: eslint-plugin-astro 2.x/3.x require ESLint 10; 1.7.0 is the last that supports 9.
- typescript 6.0: typescript-eslint 8.72 supports <6.1.
- stylelint 17, not 18: 18 needs Node >=22.22.2.
