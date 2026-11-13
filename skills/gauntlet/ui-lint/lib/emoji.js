// Emoji / dingbat-glyph classifier, ported from guardrails
// lib/guardrails/icons/emoji_scan.rb (EmojiScan#classify).
//
// Never use \p{Emoji}: it matches ASCII digits, `#` and `*`. Iterate
// grapheme clusters and classify each:
//   emoji: multi-codepoint clusters (flags, keycaps, VS16/ZWJ sequences
//          anchored on an Extended_Pictographic codepoint), or a single
//          Extended_Pictographic codepoint outside the glyph ranges.
//   glyph: a single codepoint in Arrows, Misc Technical, Geometric Shapes,
//          Misc Symbols, Dingbats, Misc Symbols & Arrows (range wins over
//          Extended_Pictographic, as in guardrails).
// ©®™ are skipped; letters, digits, punctuation, currency, ellipsis,
// dashes and quotes never match either test.

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const EXT_PICT = /\p{Extended_Pictographic}/u;
const REGIONAL_INDICATOR = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
const KEYCAP = /^[0-9#*]\ufe0f?\u20e3$/u;
const GLYPH_RANGES = [
  [0x2190, 0x21ff], // Arrows
  [0x2300, 0x23ff], // Misc Technical
  [0x25a0, 0x25ff], // Geometric Shapes
  [0x2600, 0x26ff], // Misc Symbols
  [0x2700, 0x27bf], // Dingbats
  [0x2b00, 0x2bff], // Misc Symbols and Arrows
];
const TYPOGRAPHIC_SKIP = new Set([0x00a9, 0x00ae, 0x2122]);
// Cheap pre-filter: skip strings that can't hold a match.
const MAYBE = /[\u20e3\ufe0f\u2190-\u27bf\u2b00-\u2bff\u{1F000}-\u{1FAFF}]|\p{Extended_Pictographic}/u;

export function classify(grapheme) {
  if (!grapheme) return null;
  const cps = [...grapheme];
  if (cps.length > 1) {
    if (REGIONAL_INDICATOR.test(grapheme) || KEYCAP.test(grapheme)) return "emoji";
    return cps.some((c) => EXT_PICT.test(c)) ? "emoji" : null;
  }
  const cp = cps[0].codePointAt(0);
  if (TYPOGRAPHIC_SKIP.has(cp)) return null;
  if (GLYPH_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return "glyph";
  return EXT_PICT.test(cps[0]) ? "emoji" : null;
}

// Yields { grapheme, tier, index } (UTF-16 index into text).
export function* scan(text) {
  if (!MAYBE.test(text)) return;
  for (const { segment, index } of SEGMENTER.segment(text)) {
    const tier = classify(segment);
    if (tier) yield { grapheme: segment, tier, index };
  }
}
