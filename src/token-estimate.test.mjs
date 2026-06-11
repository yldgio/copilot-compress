import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { estimateTokens, detectModelFamily } from './token-estimate.mjs';

describe('estimateTokens', () => {
  it('claude family uses /3.5 ratio', () => {
    // 'hello world' = 11 chars; Math.ceil(11 / 3.5) = 4
    assert.equal(estimateTokens('hello world', 'claude'), 4);
  });

  it('gpt family uses /4 ratio', () => {
    // Math.ceil(11 / 4) = 3
    assert.equal(estimateTokens('hello world', 'gpt'), 3);
  });

  it('unknown family uses /4 ratio (default)', () => {
    assert.equal(estimateTokens('hello world', 'unknown'), 3);
  });

  it('defaults to unknown when no modelFamily supplied', () => {
    assert.equal(estimateTokens('hello world'), 3);
  });

  it('empty string returns 0', () => {
    assert.equal(estimateTokens('', 'claude'), 0);
  });
});

describe('detectModelFamily', () => {
  it('detects claude', () => {
    assert.equal(detectModelFamily('claude-sonnet-4.6'), 'claude');
  });

  it('detects gpt', () => {
    assert.equal(detectModelFamily('gpt-4o'), 'gpt');
  });

  it('detects gemini', () => {
    assert.equal(detectModelFamily('gemini-pro'), 'gemini');
  });

  it('returns unknown for unrecognised model', () => {
    assert.equal(detectModelFamily('llama-3'), 'unknown');
  });

  it('returns unknown for empty string', () => {
    assert.equal(detectModelFamily(''), 'unknown');
  });
});
