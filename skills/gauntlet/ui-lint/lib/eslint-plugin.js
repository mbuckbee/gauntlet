// Local ESLint rules for ui-drift-js (checks 2 and 16 of /gauntlet UI Drift reviewer).
import { scan } from "./emoji.js";
import { rawColorsInText } from "./colors.js";

const MARKER = /guardrails-ok:\s*emoji\b/;

function locAt(sourceCode, node, offsetInText) {
  return sourceCode.getLocFromIndex(node.range[0] + offsetInText);
}

// Report each match inside a string-ish node's raw source text.
function reportMatches(context, node, matches, messageId, dataFor) {
  const sc = context.sourceCode;
  for (const m of matches) {
    const start = locAt(sc, node, m.index);
    const end = locAt(sc, node, m.index + m.text.length);
    context.report({ node, loc: { start, end }, messageId, data: dataFor(m) });
  }
}

const emojiIcon = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { emoji: "emoji_icon {{tier}} {{glyph}}" },
  },
  create(context) {
    const sc = context.sourceCode;
    const check = (node) => {
      const text = sc.getText(node);
      const hits = [];
      for (const { grapheme, tier, index } of scan(text)) {
        const { line } = locAt(sc, node, index);
        const here = sc.lines[line - 1] || "";
        const prev = sc.lines[line - 2] || "";
        if (MARKER.test(here) || MARKER.test(prev)) continue;
        hits.push({ text: grapheme, tier, index });
      }
      reportMatches(context, node, hits, "emoji", (m) => ({ tier: m.tier, glyph: m.text }));
    };
    return {
      JSXText: check,
      TemplateElement: check,
      Literal(node) {
        if (typeof node.value === "string") check(node);
      },
    };
  },
};

// Raw colors in color-bearing JSX attributes: fill/stroke/color/…, and any
// string inside style={…}/sx/css.
const COLOR_ATTR = /^(?:style|sx|css)$|color|fill|stroke|background|^bg/i;
const rawColorAttr = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { color: "raw_color {{color}}" },
  },
  create(context) {
    const inColorAttr = (node) => {
      for (let p = node.parent; p; p = p.parent) {
        if (p.type === "JSXAttribute") {
          const name = typeof p.name.name === "string" ? p.name.name : p.name.name?.name;
          return COLOR_ATTR.test(name || "");
        }
        if (p.type === "JSXElement" || p.type === "Program") return false;
      }
      return false;
    };
    const check = (node) => {
      if (!inColorAttr(node)) return;
      const text = context.sourceCode.getText(node);
      reportMatches(context, node, rawColorsInText(text), "color", (m) => ({ color: m.text }));
    };
    return {
      TemplateElement: check,
      Literal(node) {
        if (typeof node.value === "string") check(node);
      },
    };
  },
};

export default {
  meta: { name: "ui-drift" },
  rules: { "emoji-icon": emojiIcon, "raw-color-attr": rawColorAttr },
};
