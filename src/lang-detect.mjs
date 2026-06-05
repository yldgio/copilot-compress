// Heuristic language detection: EN vs IT.
// Runs on prose text (code blocks already extracted).
// Returns 'it' if Italian indicator score >= IT_THRESHOLD; 'en' otherwise.
// Tie and ambiguity → 'en'.

const IT_THRESHOLD = 0.30; // 30% of words must be Italian indicators

// Italian diacritics pattern — each match scores 2
const IT_DIACRITIC_RE = /[àèéìòùñ]/gi;

// Italian discourse words — each match scores 1 (word boundary)
const IT_DISCOURSE_WORDS = [
  'quindi', 'allora', 'però', 'tuttavia', 'inoltre', 'pertanto',
  'dunque', 'ebbene', 'insomma', 'comunque', 'appunto',
];
const IT_DISCOURSE_RE = new RegExp(
  `(?<!\\w)(${IT_DISCOURSE_WORDS.join('|')})(?!\\w)`,
  'gi',
);

/**
 * @param {string} text - Prose text (code blocks already removed)
 * @returns {'en' | 'it'}
 */
export function detectLang(text) {
  if (!text || text.trim().length === 0) return 'en';

  const words = text.trim().split(/\s+/).length;
  if (words < 3) return 'en'; // too short to score reliably

  let score = 0;
  const diacritics = text.match(IT_DIACRITIC_RE);
  if (diacritics) score += diacritics.length * 2;

  const discourse = text.match(IT_DISCOURSE_RE);
  if (discourse) score += discourse.length;

  return (score / words) >= IT_THRESHOLD ? 'it' : 'en';
}
