import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { compressToolOutput } from './tool-compress.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate N grep-style lines ("file.js:N:match content") */
function makeGrepLines(n) {
  return Array.from({ length: n }, (_, i) => `file.js:${i + 1}:match ${i}`).join('\n');
}

/** Generate N view-style numbered lines */
function makeViewLines(n) {
  return Array.from({ length: n }, (_, i) => `${i + 1}. line content here`).join('\n');
}

/** Generate an ASCII string of exactly `bytes` characters */
function makeString(bytes) {
  return 'x'.repeat(bytes);
}

const BASH_LIMIT    = 5 * 1024;
const GENERIC_LIMIT = 8 * 1024;

// ─── grep ─────────────────────────────────────────────────────────────────────

describe('compressToolOutput — grep', () => {
  it('caps at 50 match lines and appends omitted marker', () => {
    const input  = makeGrepLines(60);
    const result = compressToolOutput('grep', input, 'standard');
    const lines  = result.split('\n');
    assert.equal(lines[lines.length - 1], '[10 more matches omitted]');
    assert.equal(lines.length, 51); // 50 match lines + marker
  });

  it('returns unchanged when output is under the 50-line limit', () => {
    const input  = makeGrepLines(30);
    const result = compressToolOutput('grep', input, 'standard');
    assert.equal(result, input);
  });

  it('also compresses "search" tool name', () => {
    const input  = makeGrepLines(60);
    const result = compressToolOutput('search', input, 'standard');
    assert.ok(result.includes('[10 more matches omitted]'));
  });

  it('returns output unchanged when no colon lines exist (e.g. "no matches found")', () => {
    const input  = 'no matches found\nnothing here';
    const result = compressToolOutput('grep', input, 'standard');
    assert.equal(result, input);
  });
});

// ─── view ─────────────────────────────────────────────────────────────────────

describe('compressToolOutput — view', () => {
  it('caps at 200 lines and appends omitted marker', () => {
    const input  = makeViewLines(250);
    const result = compressToolOutput('view', input, 'standard');
    const lines  = result.split('\n');
    assert.equal(lines[lines.length - 1], '[50 more lines omitted]');
    assert.equal(lines.length, 201); // 200 lines + marker
  });

  it('returns unchanged when output is under 200 lines', () => {
    const input  = makeViewLines(100);
    const result = compressToolOutput('view', input, 'standard');
    assert.equal(result, input);
  });

  it('returns unchanged at exactly 200 lines', () => {
    const input  = makeViewLines(200);
    const result = compressToolOutput('view', input, 'standard');
    assert.equal(result, input);
  });
});

// ─── bash ─────────────────────────────────────────────────────────────────────

describe('compressToolOutput — bash', () => {
  it('caps at 5KB and appends truncation marker', () => {
    const input  = makeString(BASH_LIMIT + 500);
    const result = compressToolOutput('bash', input, 'standard');
    assert.ok(result.endsWith('\n[truncated — output exceeded 5KB]'));
    assert.equal(result.slice(0, BASH_LIMIT), input.slice(0, BASH_LIMIT));
  });

  it('returns unchanged when output is under 5KB', () => {
    const input  = makeString(100);
    const result = compressToolOutput('bash', input, 'standard');
    assert.equal(result, input);
  });

  it('also compresses "shell" tool name', () => {
    const input  = makeString(BASH_LIMIT + 100);
    const result = compressToolOutput('shell', input, 'standard');
    assert.ok(result.endsWith('\n[truncated — output exceeded 5KB]'));
  });
});

// ─── generic (unknown tool) ───────────────────────────────────────────────────

describe('compressToolOutput — generic (unknown tool)', () => {
  it('caps at 8KB and appends truncation marker', () => {
    const input  = makeString(GENERIC_LIMIT + 500);
    const result = compressToolOutput('unknown-tool', input, 'standard');
    assert.ok(result.endsWith('\n[truncated — output exceeded 8KB]'));
    assert.equal(result.slice(0, GENERIC_LIMIT), input.slice(0, GENERIC_LIMIT));
  });

  it('returns unchanged when output is under 8KB', () => {
    const input  = makeString(100);
    const result = compressToolOutput('unknown-tool', input, 'standard');
    assert.equal(result, input);
  });
});

// ─── JSON passthrough ─────────────────────────────────────────────────────────

describe('compressToolOutput — JSON passthrough', () => {
  it('does not compress a valid JSON object', () => {
    const input  = '{"key":"value","nested":{"a":1}}';
    const result = compressToolOutput('view', input, 'standard');
    assert.equal(result, input);
  });

  it('does not compress a valid JSON array', () => {
    const input  = '[{"id":1},{"id":2}]';
    const result = compressToolOutput('bash', input, 'standard');
    assert.equal(result, input);
  });

  it('compresses output that starts with { but is not valid JSON', () => {
    // makeString produces 'xxx...' — prepend '{' to trigger JSON check but fail parse
    // Use 'unknown-tool' so the 8KB byte cap applies (view caps by lines, not bytes)
    const input  = '{' + makeString(GENERIC_LIMIT + 100);
    const result = compressToolOutput('unknown-tool', input, 'standard');
    assert.ok(result.length < input.length);
  });
});

// ─── intensity === 'off' ──────────────────────────────────────────────────────

describe('compressToolOutput — intensity off', () => {
  it('returns view output unchanged when intensity is off', () => {
    const input  = makeViewLines(500);
    const result = compressToolOutput('view', input, 'off');
    assert.equal(result, input);
  });

  it('returns grep output unchanged when intensity is off', () => {
    const input  = makeGrepLines(100);
    const result = compressToolOutput('grep', input, 'off');
    assert.equal(result, input);
  });

  it('returns bash output unchanged when intensity is off', () => {
    const input  = makeString(BASH_LIMIT + 1000);
    const result = compressToolOutput('bash', input, 'off');
    assert.equal(result, input);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('compressToolOutput — edge cases', () => {
  it('returns empty string unchanged', () => {
    assert.equal(compressToolOutput('view', '', 'standard'), '');
  });

  it('returns null passthrough', () => {
    assert.equal(compressToolOutput('view', null, 'standard'), null);
  });

  it('returns undefined passthrough', () => {
    assert.equal(compressToolOutput('view', undefined, 'standard'), undefined);
  });
});
