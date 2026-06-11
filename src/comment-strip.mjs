// Language-aware comment stripping for fenced code blocks.
// Used by extractCodeBlocks in aggressive intensity mode.
// Fail-closed: returns original code on any error or unsupported language.

const JS_LANGS    = new Set(['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript']);
const PY_LANGS    = new Set(['py', 'python']);
const RUST_LANGS  = new Set(['rs', 'rust']);
const GO_LANGS    = new Set(['go']);
const SHELL_LANGS = new Set(['sh', 'bash', 'shell', 'zsh']);

/**
 * Strip comments from code based on language tag.
 * Returns original if lang unsupported or on any error (fail-closed).
 * @param {string} code - code content (no fence markers)
 * @param {string} lang - lowercased language tag
 * @returns {string}
 */
export function stripComments(code, lang) {
  try {
    const l = lang.toLowerCase();
    if (JS_LANGS.has(l))    return stripJsComments(code);
    if (PY_LANGS.has(l))    return stripPyComments(code);
    if (RUST_LANGS.has(l))  return stripJsComments(code); // same pattern as JS
    if (GO_LANGS.has(l))    return stripJsComments(code); // same pattern as JS
    if (SHELL_LANGS.has(l)) return stripShellComments(code);
    return code;
  } catch {
    return code;
  }
}

function stripJsComments(code) {
  let out = code.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/^\s*\/\/[^\n]*/gm, '');
  // Require actual whitespace before // so URL schemes (://) and regex
  // escape sequences (\/\/) are never touched.
  out = out.replace(/[ \t]+\/\/[^\n]*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function stripPyComments(code) {
  let out = code.replace(/"""[\s\S]*?"""/g, '');
  out = out.replace(/'''[\s\S]*?'''/g, '');
  out = out.replace(/^\s*#[^\n]*/gm, '');
  // Require actual whitespace before # so URL fragments (#anchor) and
  // shebang-style strings inside literals are never touched.
  out = out.replace(/[ \t]+#[^\n]*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function stripShellComments(code) {
  let out = code.replace(/^\s*#[^\n]*/gm, '');
  // Require actual whitespace before # so URL fragments inside strings
  // are never touched.
  out = out.replace(/[ \t]+#[^\n]*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}
