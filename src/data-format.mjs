// Data format detection helpers.
// Used to bypass compression for content that must never be altered:
// structured data formats (JSON, YAML, TOML, CSV, XML, etc.).

const DATA_FORMAT_LANGS = new Set(['json', 'yaml', 'yml', 'toml', 'csv', 'xml', 'jsonc', 'json5']);

/**
 * Returns true if the language tag identifies a data format that must
 * never be compressed.
 *
 * @param {string} lang
 * @returns {boolean}
 */
export function isDataFormatLang(lang) {
  return DATA_FORMAT_LANGS.has(lang.toLowerCase());
}

/**
 * Heuristic detection for unfenced JSON/YAML/TOML snippets in prose.
 * Fail-closed: returns false on any error.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeDataFormat(text) {
  try {
    const t = text.trim();
    // JSON check
    if (t.startsWith('{') || t.startsWith('[')) {
      try { JSON.parse(t); return true; } catch { /* not valid JSON */ }
    }
    // YAML heuristic: 2+ consecutive lines matching "word: anything"
    const lines = t.split(/\r?\n/);
    const yamlLines = lines.filter(l => /^\s*[\w-]+\s*:/.test(l));
    if (yamlLines.length >= 2 && yamlLines.length >= lines.length * 0.5) return true;
    return false;
  } catch {
    return false;
  }
}
