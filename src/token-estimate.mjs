/**
 * Estimates token count for a string.
 * Uses model-family-specific character-per-token ratios.
 *
 * @param {string} text
 * @param {'claude'|'gpt'|'gemini'|'unknown'} [modelFamily='unknown']
 * @returns {number} estimated token count
 */
export function estimateTokens(text, modelFamily = 'unknown') {
  const len = text.length;
  switch (modelFamily) {
    case 'claude':  return Math.ceil(len / 3.5);
    case 'gpt':     return Math.ceil(len / 4);
    case 'gemini':  return Math.ceil(len / 4);
    default:        return Math.ceil(len / 4);
  }
}

/**
 * Detect model family from a model name string.
 * @param {string} modelName
 * @returns {'claude'|'gpt'|'gemini'|'unknown'}
 */
export function detectModelFamily(modelName = '') {
  const m = modelName.toLowerCase();
  if (m.includes('claude')) return 'claude';
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'gpt';
  if (m.includes('gemini')) return 'gemini';
  return 'unknown';
}
