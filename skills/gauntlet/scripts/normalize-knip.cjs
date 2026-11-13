#!/usr/bin/env node
"use strict";

// Turn knip's JSON report into stable, location-free lines.
//
// Usage: normalize-knip.cjs < knip-json
//
// Each output line is `<key>\t<location>`. The key carries no line numbers, so
// a finding that only moved between the base and the branch compares equal.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function* knip(data) {
  for (const file of data.files || []) yield [`knip unused-file ${file}`, file];
  for (const issue of data.issues || []) {
    const file = issue.file;
    for (const [kind, items] of Object.entries(issue)) {
      if (kind === "file" || !items) continue;
      if (isObject(items)) {
        // enumMembers: {enum: [members]}
        for (const [owner, members] of Object.entries(items)) {
          for (const m of members) {
            const name = isObject(m) ? (m.name ?? m) : m;
            yield [`knip ${kind} ${file} ${owner}.${name}`, file];
          }
        }
        continue;
      }
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        let name;
        let line;
        if (Array.isArray(item)) {
          // duplicates: [[a, b], ...]
          name = item.map((i) => i.name ?? "?").join("=");
          line = item.length ? item[0].line : undefined;
        } else {
          name = item.name ?? "?";
          line = item.line;
        }
        yield [`knip ${kind} ${file} ${name}`, line ? `${file}:${line}` : file];
      }
    }
  }
}

const raw = require("node:fs").readFileSync(0, "utf8");
const lines = new Set([...knip(JSON.parse(raw))].map(([key, loc]) => `${key}\t${loc}`));
for (const line of [...lines].sort()) console.log(line);
