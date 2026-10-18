'use strict';

/**
 * Canonical JSON serialization — Section 5.3 (Phase II spec).
 *
 * Rules (must match Python json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False)):
 *   - Object keys sorted recursively at every depth by Unicode code point (natural sort on UTF-16).
 *   - No whitespace between tokens.
 *   - Non-ASCII characters NOT escaped (ensure_ascii=False).
 *   - null → "null", true → "true", false → "false", integers → no decimal point.
 *   - Arrays preserve insertion order.
 *   - Strings are JSON-quoted (double quotes, control chars escaped).
 *
 * NOTE: JSON.stringify does NOT sort keys, so we do it ourselves.
 * This is the single canonical() implementation for the entire project.
 * Do NOT duplicate this function in other modules — import from here.
 */
function canonical(obj) {
  if (obj === null)             return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number')  {
    // Integers: no decimal. Floats: standard JS stringification.
    return String(obj);
  }
  if (typeof obj === 'string') {
    // JSON.stringify handles escaping of control chars and quotes correctly.
    // It also escapes non-ASCII by default (e.g. \uXXXX). We need to
    // UNESCAPE them back to raw UTF-8 to match Python's ensure_ascii=False.
    return JSON.stringify(obj).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonical).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map(k => canonical(k) + ':' + canonical(obj[k]));
    return '{' + pairs.join(',') + '}';
  }
  // Fallback (undefined, functions, symbols) — treat as null like JSON.stringify
  return 'null';
}

module.exports = { canonical };
