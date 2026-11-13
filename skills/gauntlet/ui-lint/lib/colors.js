// Raw color literals: hex, and color functions whose arguments are all
// literal (no var()/env()/attr(), so `rgb(var(--x) / .5)` is a token use).
export const HEX = /(?<![\w&#-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
export const COLOR_FN = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i;
const FN_IN_TEXT = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(([^()]*)\)/gi;

// For JS strings: [{ text, index }].
export function rawColorsInText(text) {
  const out = [];
  for (const m of text.matchAll(HEX)) out.push({ text: m[0], index: m.index });
  for (const m of text.matchAll(FN_IN_TEXT)) {
    if (!/\b(?:var|env|attr)\b|\$\{/.test(m[1])) out.push({ text: m[0], index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}
