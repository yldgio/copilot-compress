import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { extractCodeBlocks, restoreCodeBlocks } from './code-blocks.mjs';
import { compressText } from './compress.mjs';

describe('extractCodeBlocks', () => {
  it('extracts fenced block', () => {
    const text = 'Fix the bug in:\n```js\nconst a = 1;\n```\nand push';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    assert.ok(!stripped.includes('const a'));
    assert.ok(stripped.includes('__CODEBLOCK_'));
  });

  it('extracts inline code', () => {
    const text = 'Call the `runCLI()` function please';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    assert.ok(!stripped.includes('runCLI'));
  });

  it('restores exactly', () => {
    const text = 'Use `npm install` to set up, then:\n```sh\nnpm run test\n```';
    const { stripped, slots } = extractCodeBlocks(text);
    const restored = restoreCodeBlocks(stripped, slots);
    assert.equal(restored, text);
  });

  it('code content is not compressed', () => {
    const text = 'Please run the following:\n```js\nconst the = "and";\n```';
    const { stripped, slots } = extractCodeBlocks(text);
    const compressed = compressText(stripped, 'en');
    const restored = restoreCodeBlocks(compressed, slots);
    assert.ok(restored.includes('const the = "and";'), 'code was incorrectly compressed');
  });

  it('no code blocks → identity', () => {
    const text = 'just some plain prose';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 0);
    assert.equal(stripped, text);
  });
});
