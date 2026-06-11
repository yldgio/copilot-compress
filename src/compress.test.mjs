import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { compressText } from './compress.mjs';

describe('compressText EN', () => {
  it('removes articles', () => {
    const out = compressText('The quick brown fox jumps over the lazy dog');
    assert.ok(!out.includes(' the '), 'article "the" not removed');
  });
  it('removes "and"', () => {
    const out = compressText('create a branch and push it');
    assert.ok(!out.includes(' and '), '"and" not removed');
  });
  it('preserves numbers', () => {
    const out = compressText('there are 42 items in the list');
    assert.ok(out.includes('42'));
  });
  it('normalizes whitespace', () => {
    const out = compressText('hello   world');
    assert.equal(out, 'hello world');
  });
  it('handles empty string', () => {
    assert.equal(compressText(''), '');
  });
});

describe('compressText IT', () => {
  it('removes quindi', () => {
    const out = compressText('Quindi il sistema funziona bene', 'it');
    assert.ok(!out.includes('quindi'), '"quindi" not removed');
  });
  it('removes contracted preposition mid-sentence', () => {
    const out = compressText('Vado alla stazione domani', 'it');
    assert.ok(!out.includes(' alla '), '"alla" not removed');
  });
  it('preserves sentence-start contracted preposition', () => {
    // "Alla" at start of string: should be preserved (sentence boundary)
    const out = compressText('Alla fine del giorno', 'it');
    assert.ok(out.toLowerCase().startsWith('alla'), 'sentence-start "alla" was wrongly removed');
  });
});

describe('compressText intensity parameter', () => {
  it('accepts lite intensity and returns string', () => {
    const out = compressText('hello world test', 'en', 'lite');
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });
  it('accepts aggressive intensity and returns string', () => {
    const out = compressText('hello world test', 'en', 'aggressive');
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });
  it('accepts off intensity and returns string', () => {
    const out = compressText('hello world test', 'en', 'off');
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });
});
