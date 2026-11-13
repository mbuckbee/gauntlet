import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, scan } from "../lib/emoji.js";

const POSITIVES = ["📄", "👨‍👩‍👧", "🇺🇸", "1️⃣", "✓", "→", "★", "●", "⚠", "⚠️", "✏", "🗑"];
const NEGATIVES = ["a", "1", "#", "*", "©", "®", "™", "…", "—", "–", '"', "“", "”", "€", "£", "×", "é", " ", "Ω"];

test("flags emoji and dingbat glyphs as single graphemes", () => {
  for (const g of POSITIVES) {
    assert.ok(classify(g), `expected ${g} to match`);
    assert.equal([...scan(g)].length, 1, `${g} should be one finding`);
  }
});

test("leaves copy alone", () => {
  for (const g of NEGATIVES) assert.equal(classify(g), null, `${g} should not match`);
  assert.equal([...scan('Price: €5 × 2 — "ok"… © 2026 #1 *')].length, 0);
});

test("tiers follow guardrails: range first, then Extended_Pictographic", () => {
  assert.equal(classify("⚠"), "glyph");
  assert.equal(classify("⚠️"), "emoji");
  assert.equal(classify("📄"), "emoji");
});
