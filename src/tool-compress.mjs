// ─── Tool output compressor ───────────────────────────────────────────────────

const GREP_MATCH_LIMIT   = 50;
const VIEW_LINE_LIMIT    = 200;
const BASH_BYTE_LIMIT    = 5 * 1024; // 5 KB
const GENERIC_BYTE_LIMIT = 8 * 1024; // 8 KB

/**
 * Compresses tool output before it enters the LLM context.
 * Only active when intensity !== 'off'.
 *
 * Strategies per tool:
 * - grep: keep only filename:linenum lines, cap at 50 matches
 * - view: cap at 200 lines, add "[N more lines omitted]" marker
 * - bash/shell: cap stdout at 5KB, add "[truncated]" marker
 * - generic: cap at 8KB
 *
 * Data format safety: JSON output is never truncated mid-structure.
 *
 * @param {string} toolName
 * @param {string} output  - the tool output as a string
 * @param {'off'|'lite'|'standard'|'aggressive'} intensity
 * @returns {string} - compressed output (may equal input if under limits)
 */
export function compressToolOutput(toolName, output, intensity) {
  if (!output || intensity === 'off') return output;

  // JSON passthrough — never truncate mid-structure
  const trimmed = output.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return output; } catch { /* not valid JSON — fall through */ }
  }

  switch (toolName.toLowerCase()) {
    case 'grep':
    case 'search':
      return compressGrep(output);
    case 'view':
    case 'read':
    case 'read_file':
      return compressView(output);
    case 'bash':
    case 'shell':
    case 'run_command':
    case 'execute':
      return compressBash(output);
    default:
      return compressGeneric(output);
  }
}

function compressGrep(output) {
  const lines      = output.split(/\r?\n/);
  const matchLines = lines.filter(l => l.includes(':'));
  // Only filter and cap when the match count exceeds the limit;
  // below the limit, return the original output unchanged (preserves summary lines etc.)
  if (matchLines.length <= GREP_MATCH_LIMIT) return output;
  const kept    = matchLines.slice(0, GREP_MATCH_LIMIT);
  const omitted = matchLines.length - GREP_MATCH_LIMIT;
  return kept.join('\n') + `\n[${omitted} more matches omitted]`;
}

function compressView(output) {
  const lines = output.split(/\r?\n/);
  if (lines.length <= VIEW_LINE_LIMIT) return output;
  const kept    = lines.slice(0, VIEW_LINE_LIMIT);
  const omitted = lines.length - VIEW_LINE_LIMIT;
  return kept.join('\n') + `\n[${omitted} more lines omitted]`;
}

function compressBash(output) {
  if (output.length <= BASH_BYTE_LIMIT) return output;
  return output.slice(0, BASH_BYTE_LIMIT) + '\n[truncated — output exceeded 5KB]';
}

function compressGeneric(output) {
  if (output.length <= GENERIC_BYTE_LIMIT) return output;
  return output.slice(0, GENERIC_BYTE_LIMIT) + '\n[truncated — output exceeded 8KB]';
}
