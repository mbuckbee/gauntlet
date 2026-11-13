// Stylelint rule ui-drift/raw-color: hex and literal color functions in
// declaration values. Custom-property / SCSS-variable definitions are token
// definitions and exempt (UI Drift check 2).
import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import { COLOR_FN } from "./colors.js";

const ruleName = "ui-drift/raw-color";
const messages = stylelint.utils.ruleMessages(ruleName, { color: (c) => `raw_color ${c}` });
const HEX_WORD = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})$/i;

const rule = (primary) => (root, result) => {
  if (!primary) return;
  root.walkDecls((decl) => {
    if (/^(?:--|\$|@)/.test(decl.prop)) return;
    const value = decl.raws.value?.raw ?? decl.value;
    if (!/#|\(/.test(value)) return;
    const offset = decl.prop.length + (decl.raws.between || "").length;
    valueParser(value).walk((n) => {
      let hit = null;
      if (n.type === "word" && HEX_WORD.test(n.value)) hit = n.value;
      else if (n.type === "function" && COLOR_FN.test(n.value)) {
        if (/\b(?:var|env|attr)\(|#\{|\$/.test(valueParser.stringify(n.nodes))) return false;
        hit = valueParser.stringify(n);
      }
      if (!hit) return undefined;
      stylelint.utils.report({
        ruleName, result, node: decl, message: messages.color(hit),
        index: offset + n.sourceIndex, endIndex: offset + n.sourceIndex + hit.length,
      });
      return false;
    });
  });
};
rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
