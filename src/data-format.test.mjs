import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { isDataFormatLang, looksLikeDataFormat } from './data-format.mjs';

describe('isDataFormatLang', () => {
  it('json → true', () => assert.equal(isDataFormatLang('json'), true));
  it('yaml → true', () => assert.equal(isDataFormatLang('yaml'), true));
  it('yml → true',  () => assert.equal(isDataFormatLang('yml'),  true));
  it('toml → true', () => assert.equal(isDataFormatLang('toml'), true));
  it('python → false', () => assert.equal(isDataFormatLang('python'), false));
  it('JS (uppercase) → false (case-insensitive check, js not in safelist)', () => {
    assert.equal(isDataFormatLang('JS'), false);
  });
  it('empty string → false', () => assert.equal(isDataFormatLang(''), false));
});

describe('looksLikeDataFormat', () => {
  it('valid JSON object → true', () => {
    assert.equal(looksLikeDataFormat('{"key":"value"}'), true);
  });

  it('valid JSON array → true', () => {
    assert.equal(looksLikeDataFormat('[1,2,3]'), true);
  });

  it('plain prose → false', () => {
    assert.equal(looksLikeDataFormat('not json'), false);
  });

  it('YAML-like multi-line → true', () => {
    assert.equal(looksLikeDataFormat('key: value\nother: thing\nthird: item'), true);
  });

  it('invalid JSON → false (fail closed)', () => {
    assert.equal(looksLikeDataFormat('{"broken":}'), false);
  });
});
