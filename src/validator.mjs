/**
 * Validates that compression preserved structural invariants.
 * Returns true if compressed is safe to use; false triggers fallback to original.
 *
 * Checks:
 * 1. Heading count matches (markdown # headings)
 * 2. URL set equality (all URLs in original present in compressed)
 * 3. Inline backtick count matches
 *
 * Fail-closed: returns false on any error.
 *
 * @param {string} original
 * @param {string} compressed
 * @returns {boolean}
 */
export function validate(original, compressed) {
  try {
    // 1. Heading count
    const origHeadings = (original.match(/^#{1,6}\s/gm)  || []).length;
    const compHeadings = (compressed.match(/^#{1,6}\s/gm) || []).length;
    if (origHeadings !== compHeadings) return false;

    // 2. URLs — every URL in original must be present in compressed
    const origUrls = original.match(/https?:\/\/[^\s)>"]+/g) || [];
    const compText = compressed;
    for (const url of origUrls) {
      if (!compText.includes(url)) return false;
    }

    // 3. Inline backtick count
    const origBt = (original.match(/`[^`\r\n]+`/g)  || []).length;
    const compBt = (compressed.match(/`[^`\r\n]+`/g) || []).length;
    if (origBt !== compBt) return false;

    return true;
  } catch {
    return false;
  }
}
