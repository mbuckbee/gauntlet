#!/usr/bin/env bash
# Dead-code check: knip for JS/TS (package.json), spoom deadcode for Ruby (Gemfile.lock).
#
# Usage: dead-code.sh [--full] [--base <ref>]
#   default  diff mode: report only candidates the working tree has that the
#            merge-base with <ref> (default origin/main) does not. Pre-existing
#            dead code and the tools' standing false positives cancel out.
#   --full   report every candidate in the working tree.
#
# Exit: 0 nothing (new) found, 1 candidates found, 2 tool error.
# Read-only: never modifies the repo. The base snapshot is a `git archive`
# extracted into a temp dir.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NORMALIZE_KNIP="$SKILL_DIR/scripts/normalize-knip.cjs"
NORMALIZE_SPOOM="$SKILL_DIR/scripts/normalize-spoom.rb"
SPOOM_GEMFILE="$SKILL_DIR/spoom/Gemfile"
KNIP_VERSION="5.88.1"

MODE=diff
BASE_REF=origin/main
while [ $# -gt 0 ]; do
  case "$1" in
    --full) MODE=full ;;
    --base) BASE_REF="$2"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/dead-code.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

HAS_JS=; HAS_RUBY=
[ -f "$REPO/package.json" ] && HAS_JS=1
[ -f "$REPO/Gemfile.lock" ] && HAS_RUBY=1
if [ -z "$HAS_JS$HAS_RUBY" ]; then
  echo "dead-code: no package.json or Gemfile.lock at $REPO; nothing to check"
  exit 0
fi

knip_cmd() {
  if [ -x "$REPO/node_modules/.bin/knip" ]; then
    echo "$REPO/node_modules/.bin/knip"
  else
    echo "npx --yes knip@$KNIP_VERSION"
  fi
}

# run_knip <dir> → normalized lines on stdout
run_knip() {
  local out
  if ! out="$(cd "$1" && $(knip_cmd) --no-progress --no-exit-code --reporter json 2>"$TMP/knip.err")"; then
    echo "knip failed in $1:" >&2; tail -20 "$TMP/knip.err" >&2; return 2
  fi
  printf '%s' "$out" | node "$NORMALIZE_KNIP"
}

# run_spoom <dir> → normalized lines on stdout
run_spoom() {
  if ! BUNDLE_GEMFILE="$SPOOM_GEMFILE" bundle check >/dev/null 2>&1; then
    BUNDLE_GEMFILE="$SPOOM_GEMFILE" bundle install --quiet >&2 || { echo "spoom bundle install failed" >&2; return 2; }
  fi
  (cd "$1" && BUNDLE_GEMFILE="$SPOOM_GEMFILE" bundle exec spoom deadcode 2>&1 || true) \
    | grep -v "ostruct" | ruby "$NORMALIZE_SPOOM"
}

if [ "$MODE" = diff ]; then
  git -C "$REPO" rev-parse --verify --quiet "$BASE_REF" >/dev/null \
    || { echo "dead-code: base ref $BASE_REF not found (git fetch origin main?)" >&2; exit 2; }
  MERGE_BASE="$(git -C "$REPO" merge-base "$BASE_REF" HEAD)"
  mkdir -p "$TMP/base"
  git -C "$REPO" archive "$MERGE_BASE" | tar -x -C "$TMP/base"
fi

FOUND=0
report() { # report <tool> <head-file> [<base-file>]
  local tool="$1" head="$2" base="${3:-}" lines
  if [ -n "$base" ]; then
    # keep head lines whose key (field 1) is absent from base
    lines="$(awk -F'\t' 'NR==FNR { seen[$1]=1; next } !($1 in seen)' "$base" "$head")"
    label="new since $(git -C "$REPO" rev-parse --short "$MERGE_BASE")"
  else
    lines="$(cat "$head")"; label="total"
  fi
  local n; n="$(printf '%s' "$lines" | grep -c . || true)"
  echo "== $tool: $n candidate(s), $label"
  [ "$n" -gt 0 ] && { printf '%s\n' "$lines" | awk -F'\t' '{ sub(/^(knip|spoom) /, "", $1); printf "  %s  (%s)\n", $1, $2 }'; FOUND=1; }
  return 0
}

if [ -n "$HAS_RUBY" ]; then
  run_spoom "$REPO" > "$TMP/spoom.head" || exit 2
  if [ "$MODE" = diff ]; then
    run_spoom "$TMP/base" > "$TMP/spoom.base" || exit 2
    report spoom "$TMP/spoom.head" "$TMP/spoom.base"
  else
    report spoom "$TMP/spoom.head"
  fi
fi

if [ -n "$HAS_JS" ]; then
  if [ ! -d "$REPO/node_modules" ]; then
    echo "dead-code: $REPO has no node_modules; run npm ci first (knip needs it to load configs)" >&2; exit 2
  fi
  run_knip "$REPO" > "$TMP/knip.head" || exit 2
  if [ "$MODE" = diff ]; then
    # spoom has already run on base, so the symlink can't leak into its scan
    ln -s "$REPO/node_modules" "$TMP/base/node_modules"
    run_knip "$TMP/base" > "$TMP/knip.base" || exit 2
    report knip "$TMP/knip.head" "$TMP/knip.base"
  else
    report knip "$TMP/knip.head"
  fi
fi

exit "$FOUND"
