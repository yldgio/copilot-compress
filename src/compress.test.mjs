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

describe('compressText EN pleasantries', () => {
  it('strips opening pleasantry at lite', () => {
    const out = compressText('Sure! Can you help', 'en', 'lite');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!out.toLowerCase().includes('sure'), '"Sure" not stripped at lite');
  });

  it('strips opening pleasantry at standard', () => {
    const out = compressText('Sure! The database connection pool is working fine today', 'en', 'standard');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!out.toLowerCase().includes('sure'), '"Sure" not stripped at standard');
  });

  it('strips comma-terminated opening pleasantry', () => {
    // "Sure, ..." — comma must be consumed, not left as leading punctuation
    const out = compressText('Sure, the configuration looks correct to me', 'en', 'lite');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!out.startsWith(','), 'dangling comma after pleasantry strip');
    assert.ok(!out.toLowerCase().includes('sure'), '"Sure" not stripped');
  });

  it('does NOT strip pleasantry at off', () => {
    const out = compressText('Sure! Can you help', 'en', 'off');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(out.toLowerCase().includes('sure'), 'pleasantry stripped at off — should not be');
  });
});

describe('compressText EN hedging', () => {
  it('does NOT strip hedging at lite', () => {
    const out = compressText('I think software development requires careful planning and attention', 'en', 'lite');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(out.includes('think'), 'hedging "think" was wrongly stripped at lite');
  });

  it('strips hedging at standard', () => {
    const out = compressText('I think software development requires careful planning and attention', 'en', 'standard');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!out.includes('think'), '"think" not stripped at standard');
  });

  it('strips connective at standard', () => {
    const out = compressText('The solution works however it needs additional testing before deployment', 'en', 'standard');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!out.toLowerCase().includes('however'), '"however" not stripped at standard');
  });

  it('preserves "rather than" comparative construction', () => {
    // "rather than" must survive — stripping "rather" would corrupt the meaning
    const out = compressText('use Python rather than Java for this scripting task today', 'en', 'standard');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(out.toLowerCase().includes('rather than'), '"rather than" was wrongly stripped');
  });
});

describe('compressText IT pleasantries and hedging', () => {
  it('strips IT pleasantry at lite', () => {
    const out = compressText('Prego il sistema funziona perfettamente adesso', 'it', 'lite');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!/prego/i.test(out), 'IT pleasantry "prego" not stripped at lite');
  });

  it('strips IT hedging at standard', () => {
    const out = compressText('Forse il sistema funziona meglio dopo questo aggiornamento', 'it', 'standard');
    assert.ok(out !== undefined, 'expected a string, got undefined');
    assert.ok(!/forse/i.test(out), 'IT hedging "forse" not stripped at standard');
  });
});

describe('compressText safety gate', () => {
  it('returns undefined when compression over-strips long prose', () => {
    // All function words + hedging → leaves only "done" (1 word) — gate fires
    const out = compressText('I think it is so that it should just be done', 'en', 'standard');
    assert.equal(out, undefined, 'safety gate should have returned undefined');
  });

  it('returns a string for normal prose', () => {
    const out = compressText('The database connection pool manages multiple concurrent requests efficiently', 'en', 'standard');
    assert.ok(typeof out === 'string', `expected string, got ${typeof out}`);
  });
});
