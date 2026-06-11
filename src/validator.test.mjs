import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { validate } from './validator.mjs';

describe('validate — headings', () => {
  it('headings preserved → true', () => {
    assert.equal(validate('# Hello\n\nsome text', '# Hello\n\nshort'), true);
  });

  it('heading added in compressed → false', () => {
    assert.equal(validate('# Hello\n\ntext', '# Hello\n\n# Extra\n\ntext'), false);
  });

  it('heading removed in compressed → false', () => {
    assert.equal(validate('# One\n\n## Two\n\ntext', '# One\n\ntext'), false);
  });
});

describe('validate — URLs', () => {
  it('URL present in both → true', () => {
    assert.equal(
      validate('see https://example.com for details', 'see https://example.com'),
      true,
    );
  });

  it('URL missing from compressed → false', () => {
    assert.equal(
      validate('check https://example.com and https://other.com', 'check https://example.com'),
      false,
    );
  });

  it('no URLs in either → true', () => {
    assert.equal(validate('plain text here', 'plain text'), true);
  });
});

describe('validate — inline backticks', () => {
  it('inline backtick count preserved → true', () => {
    assert.equal(validate('use `foo` and `bar`', 'use `foo` and `bar` here'), true);
  });

  it('inline backtick lost in compressed → false', () => {
    assert.equal(validate('use `foo` and `bar`', 'use foo and bar'), false);
  });

  it('restoration failure: slot key left unrestored → false', () => {
    // Simulates restoreCodeBlocks failing to replace __CODEBLOCK_0__ with `foo`
    assert.equal(validate('use `foo`', 'use __CODEBLOCK_0__'), false);
  });
});

describe('validate — edge cases', () => {
  it('empty strings → true', () => {
    assert.equal(validate('', ''), true);
  });

  it('fail-closed: non-string input throws internally → false', () => {
    // Pass null to force an internal error (null.match throws)
    assert.equal(validate(null, null), false);
  });
});
