// Extract fenced and inline code blocks from text, replacing them with
// placeholders so the compression pass never touches code content.
// Placeholders survive compressText() unchanged (no filler words match __CODEBLOCK_N__).

const FENCED_RE  = /```[\w-]*\r?\n[\s\S]*?```/g;
const INLINE_RE  = /`[^`\r\n]+`/g;
const SLOT_PREFIX = '__CODEBLOCK_';

/**
 * @param {string} text
 * @returns {{ stripped: string, slots: Map<string, { raw: string, lang: string }> }}
 */
export function extractCodeBlocks(text) {
  const slots = new Map();
  let idx = 0;

  // Fenced first (they may contain backticks)
  let stripped = text.replace(FENCED_RE, (match) => {
    const key = `${SLOT_PREFIX}${idx++}__`;
    const lang = match.match(/^```([\w-]*)/)?.[1] ?? '';
    slots.set(key, { raw: match, lang });
    return key;
  });

  // Inline second
  stripped = stripped.replace(INLINE_RE, (match) => {
    const key = `${SLOT_PREFIX}${idx++}__`;
    slots.set(key, { raw: match, lang: '' });
    return key;
  });

  return { stripped, slots };
}

/**
 * @param {string} text
 * @param {Map<string, { raw: string, lang: string }>} slots
 * @returns {string}
 */
export function restoreCodeBlocks(text, slots) {
  let out = text;
  for (const [key, slot] of slots) {
    out = out.split(key).join(slot.raw);
  }
  return out;
}
