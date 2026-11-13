#!/usr/bin/env python3
"""Turn knip JSON or spoom deadcode text into stable, location-free lines.

Usage: normalize.py knip|spoom < tool-output

Each output line is `<key>\t<location>`. The key carries no line numbers, so a
finding that only moved between the base and the branch compares equal.
"""
import json
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")
SPOOM_CANDIDATE = re.compile(r"^\s+(\S+)\s+(\S+?):(\d+):\d+-\d+:\d+\s*$")


def knip(raw):
    data = json.loads(raw)
    for path in data.get("files", []):
        yield f"knip unused-file {path}", path
    for issue in data.get("issues", []):
        path = issue["file"]
        for kind, items in issue.items():
            if kind == "file" or not items:
                continue
            if isinstance(items, dict):  # enumMembers: {enum: [members]}
                for enum, members in items.items():
                    for m in members:
                        name = m.get("name", m) if isinstance(m, dict) else m
                        yield f"knip {kind} {path} {enum}.{name}", path
                continue
            for item in items:
                if isinstance(item, list):  # duplicates: [[a, b], ...]
                    name = "=".join(i.get("name", "?") for i in item)
                    line = item[0].get("line") if item else None
                else:
                    name = item.get("name", "?")
                    line = item.get("line")
                loc = f"{path}:{line}" if line else path
                yield f"knip {kind} {path} {name}", loc


def spoom(raw):
    text = ANSI.sub("", raw)
    if "Analyzing" not in text and "No dead code" not in text:
        sys.stderr.write("spoom output not recognised:\n" + text[-2000:])
        sys.exit(2)
    in_candidates = False
    for line in text.splitlines():
        if line.startswith("Candidates:"):
            in_candidates = True
            continue
        if in_candidates:
            m = SPOOM_CANDIDATE.match(line)
            if m:
                symbol, path, lineno = m.groups()
                yield f"spoom {symbol} {path}", f"{path}:{lineno}"


def main():
    tool = sys.argv[1]
    raw = sys.stdin.read()
    gen = {"knip": knip, "spoom": spoom}[tool](raw)
    for key, loc in sorted(set(gen)):
        print(f"{key}\t{loc}")


if __name__ == "__main__":
    main()
