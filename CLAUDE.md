# gauntlet

Code-review skill for Claude Code. The skill is `skills/gauntlet/SKILL.md`, and each reviewer's checklist is in `skills/gauntlet/references/`.

Check: `node --test skills/gauntlet/scripts/test/*.test.mjs` and `cd skills/gauntlet/ui-lint && npm test`. Pass test files, not the folder: `node --test <dir>/` tries to load the folder as a module and fails.

## Gotchas

- osv-scanner (`scripts/osv-deps`) reads `osv-scanner.toml` and `requirements.txt` `-r`/`-c` includes from beside each lockfile. A lockfile copied alone into a temp dir silently loses both. Scan it in place, or in a `git archive` of the whole tree.
- osv-scanner resolves manifests (`pom.xml`, `requirements.txt`) over the network by default, fetching from repositories the file names. Keep `--no-resolve` on every scan, since the file under review can come from an untrusted PR.
- osv-scanner infers a lockfile's format only from its exact name. Use `-L requirements.txt:<path>` for `requirements-dev.txt` and the like. Its exit codes: 0 clean, 1 vulnerabilities found, 128 no packages, anything else an error.
- The script tests put a fake `osv-scanner` on `PATH`, so they run offline. Check a change against the real scanner by hand as well.
