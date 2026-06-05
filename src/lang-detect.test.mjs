import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { detectLang } from './lang-detect.mjs';

describe('detectLang', () => {
  it('detects EN for English prose', () => {
    assert.equal(detectLang('Can you fix the build and run the tests again'), 'en');
  });
  it('detects IT for Italian prose with diacritics', () => {
    assert.equal(detectLang('Puoi correggere il codice però non toccare però il modulo già funzionante'), 'it');
  });
  it('detects IT from discourse words', () => {
    assert.equal(detectLang('Quindi dobbiamo rivedere inoltre la struttura dunque del sistema'), 'it');
  });
  it('returns EN for empty string', () => {
    assert.equal(detectLang(''), 'en');
  });
  it('returns EN for very short text', () => {
    assert.equal(detectLang('ciao'), 'en');
  });
  it('EN text with one Italian word stays EN', () => {
    // Single "però" in a long English sentence should not tip to IT
    assert.equal(detectLang('This is a long English sentence with però one Italian word'), 'en');
  });
});
