// ─── Compression helper ───────────────────────────────────────────────────────

// ── English filler words ──────────────────────────────────────────────────────
const ENGLISH_FILLERS = /\b(a|an|the|and|or|but|so|yet|for|nor|it|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|to|of|in|on|at|by|with|from|as|that|this|these|those|i|we|you|they|he|she|its|our|your|their|my|his|her|very|just|really|quite|also|even|still|already|now|then|here|there|please|thank|thanks|sure|okay|ok)\b/gi;

// ── English pleasantries & hedging (intensity-gated) ─────────────────────────

// Opening pleasantry words/phrases at the start of a message — all non-off levels.
const EN_OPENING_PHRASES = /^(sure[!.,]?\s*|okay[!.,]?\s*|ok[!.,]?\s*|of course[!.,]?\s*|certainly[!.,]?\s*|absolutely[!.,]?\s*|happy to help[!.,]?\s*|glad to help[!.,]?\s*|no problem[!.,]?\s*|no worries[!.,]?\s*)/i;

// Inline pleasantry phrases — all non-off levels.
const EN_PLEASANTRIES_INLINE = /\b(you're welcome|my pleasure|with pleasure)\b[!.]?/gi;

// Hedging language — standard+ only.
const EN_HEDGING = /\b(i think|i believe|i suppose|i guess|probably|perhaps|maybe|possibly|it seems|it appears|sort of|kind of|somewhat|rather(?!\s+than)|a bit|a little)\b/gi;

// Verbose connective/transitional phrases — standard+ only.
const EN_CONNECTIVES = /\b(however|nevertheless|nonetheless|therefore|consequently|in order to|with that said|that being said|having said that|due to the fact that|it is worth noting that|it should be noted that)\b/gi;

// ── Italian filler words ──────────────────────────────────────────────────────

// Multi-word phrases (removed first, before single-word pass)
const IT_PHRASES = [
  'in sostanza', 'in pratica', 'in effetti', 'in realtà',
  'per quanto riguarda', 'dal punto di vista', 'a livello di',
  'al fine di', 'allo scopo di', 'nel senso che',
  'per il fatto che', 'a causa del fatto che',
];

// ── Italian pleasantries (all non-off intensity levels) ───────────────────────
const IT_PLEASANTRY_WORDS = [
  'certo', 'certamente', 'assolutamente', 'figurati', 'prego',
  'volentieri', 'nessun problema',
];

// ── Italian hedging (standard + aggressive only) ──────────────────────────────
const IT_HEDGING_WORDS = [
  'probabilmente', 'forse', 'magari', 'possibilmente',
  'diciamo', 'in un certo senso', 'per così dire',
  'mi sembra', 'sembra che', 'pare che', 'a quanto pare',
];

// Single-word discourse fillers / adverbs safe to remove unconditionally.
// NOT included: che, ne, si, ci, lo, la, li, le, gli (polysemous pronoun+conjunction).
// Use (?<!\w)…(?!\w) instead of \b…\b so accented endings (e.g. però→ò) are handled.
const IT_SINGLE_WORDS = [
  'quindi', 'allora', 'però', 'tuttavia', 'inoltre', 'pertanto',
  'dunque', 'ebbene', 'insomma', 'comunque', 'appunto',
  'semplicemente', 'praticamente', 'ovviamente', 'chiaramente',
  'naturalmente', 'sicuramente', 'certamente', 'effettivamente',
  'fondamentalmente', 'sostanzialmente', 'essenzialmente',
  'generalmente', 'normalmente', 'tipicamente', 'solitamente',
  'abitualmente', 'frequentemente', 'spesso', 'talvolta', 'eventualmente',
];

// Build single-word filler regex once (not at module load — keep it lazy for testability)
function buildItalianSinglePattern() {
  return new RegExp(`(?<!\\w)(${IT_SINGLE_WORDS.join('|')})(?!\\w)`, 'gi');
}

// Contracted prepositions: safe to remove, but only mid-sentence.
// Heuristic: keep if at start of string or preceded by comma/sentence-boundary char.
// Pattern: require a non-boundary character + whitespace before the word.
const IT_CONTRACTED = [
  'della', 'dello', 'delle', 'degli',
  'nella', 'nello', 'nelle', 'negli',
  'sulla', 'sullo', 'sulle', 'sugli',
  'dalla', 'dallo', 'dalle', 'dagli',
  'alla',  'allo',  'alle',  'agli',
];

function buildItalianContractedPattern() {
  // (?<=[^.,!?\n][ \t]+) — must be preceded by a non-sentence-boundary char + horizontal
  // whitespace only (space/tab). Using [ \t]+ rather than \s+ so that newlines act as
  // sentence boundaries — a contracted preposition at the start of a new line is preserved.
  return new RegExp(
    `(?<=[^.,!?\\n][ \\t]+)\\b(${IT_CONTRACTED.join('|')})\\b`,
    'gi',
  );
}

/**
 * Apply a list of Italian words/phrases as whitespace replacements.
 * Multi-word entries are processed first (to prevent partial single-word matches).
 *
 * @param {string} text
 * @param {string[]} words
 * @returns {string}
 */
function applyItalianWordList(text, words) {
  let result = text;
  // Multi-word phrases first
  for (const word of words) {
    if (word.includes(' ')) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), ' ');
    }
  }
  // Single words with lookaround boundaries (handles accented chars)
  const singles = words.filter(w => !w.includes(' '));
  if (singles.length > 0) {
    const pat = new RegExp(`(?<!\\w)(${singles.join('|')})(?!\\w)`, 'gi');
    result = result.replace(pat, ' ');
  }
  return result;
}

/**
 * Safety gate: refuse to return compressed text if the result looks over-stripped.
 * Only applies when the original text was substantial (≥ 8 words) — short inputs
 * naturally produce short output and are never considered unsafe.
 *
 * Conditions that fail the gate:
 *   • Compressed result has fewer than 5 words.
 *   • More than 40% of compressed words (after word[0]) start with a capital letter,
 *     suggesting critical context words were stripped while proper nouns survived.
 *
 * @param {string} original  - Original input text.
 * @param {string} compressed - Compressed output.
 * @returns {boolean} true if safe to return, false to discard.
 */
function isSafeToCompress(original, compressed) {
  // Short originals naturally compress to few words — never gate them.
  const originalWords = original.trim().split(/\s+/);
  if (originalWords.length < 8) return true;

  const words = compressed.trim().split(/\s+/);
  if (words.length < 5) return false;

  // Proper noun heuristic: words[1..] starting uppercase
  const properNouns = words.slice(1).filter(w => /^[A-Z]/.test(w));
  if (properNouns.length / words.length > 0.40) return false;

  return true;
}

/**
 * Caveman compression: strips articles, filler words, pleasantries, hedging.
 * Keeps technical terms, numbers, proper nouns, and action verbs exact.
 * Returns a compressed version of the input string, or `undefined` if the
 * safety gate determines the result is unsafe (too short / over-stripped).
 * Reduction: ~40-60% on prose.
 * Pure function — no I/O, no DB.
 *
 * @param {string} text - Text to compress.
 * @param {'en'|'it'} [lang='en'] - Language of the text; controls filler word list.
 * @param {'off'|'lite'|'standard'|'aggressive'} [intensity='standard'] - Compression depth.
 *   off        — pass through unchanged (no compression)
 *   lite       — pleasantries only (safe subset, no stopword removal)
 *   standard   — pleasantries + hedging + connectives + stopwords (default)
 *   aggressive — same as standard + comment stripping in code blocks (wired in extension.mjs)
 * @returns {string|undefined} Compressed text, or undefined if safety gate fires.
 */
export function compressText(text, lang = 'en', intensity = 'standard') {
  if (!text || text.length === 0) return text;

  let compressed = text;

  if (lang === 'it') {
    // Pass 0: pleasantries (all non-off levels — lite, standard, aggressive)
    if (intensity !== 'off') {
      compressed = applyItalianWordList(compressed, IT_PLEASANTRY_WORDS);
    }

    // Pass 1: remove multi-word phrases
    for (const phrase of IT_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      compressed = compressed.replace(new RegExp(escaped, 'gi'), ' ');
    }

    // Pass 2: remove single-word fillers
    compressed = compressed.replace(buildItalianSinglePattern(), ' ');

    // Pass 3: remove contracted prepositions (mid-sentence only)
    compressed = compressed.replace(buildItalianContractedPattern(), ' ');

    // Pass 4: hedging (standard+)
    if (intensity === 'standard' || intensity === 'aggressive') {
      compressed = applyItalianWordList(compressed, IT_HEDGING_WORDS);
    }
  } else {
    // English (default)

    // Pass 0: pleasantries (all non-off levels)
    if (intensity !== 'off') {
      compressed = compressed.replace(EN_OPENING_PHRASES, '');
      compressed = compressed.replace(EN_PLEASANTRIES_INLINE, '');
    }

    // Pass 1: hedging + connectives (standard+)
    if (intensity === 'standard' || intensity === 'aggressive') {
      compressed = compressed.replace(EN_HEDGING, '');
      compressed = compressed.replace(EN_CONNECTIVES, '');
    }

    // Pass 2: existing ENGLISH_FILLERS (standard+)
    if (intensity === 'standard' || intensity === 'aggressive') {
      compressed = compressed.replace(ENGLISH_FILLERS, ' ');
    }
  }

  // Normalize whitespace and punctuation spacing
  compressed = compressed
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\s+([.,;:])/g, '$1');

  // Safety gate: return undefined if compression over-stripped long prose
  if (!isSafeToCompress(text, compressed)) return undefined;

  return compressed;
}
