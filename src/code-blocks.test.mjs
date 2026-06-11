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

  // Issue 2: CRLF fenced block extraction
  it('extracts fenced block with CRLF line endings', () => {
    const text = 'Fix the bug in:\r\n```js\r\nconst a = 1;\r\n```\r\nand push';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1, 'CRLF fenced block not extracted');
    assert.ok(!stripped.includes('const a'), 'code content leaked into stripped text');
    assert.ok(stripped.includes('__CODEBLOCK_'));
  });

  // Issue 2+3: CRLF + hyphenated language tag
  it('extracts fenced block with hyphenated language tag (e.g. objective-c)', () => {
    const text = 'Example:\n```objective-c\n[obj method];\n```\ndone';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1, 'hyphenated lang tag fenced block not extracted');
    assert.ok(!stripped.includes('[obj method]'));
  });

  it('extracts fenced block with hyphenated tag and CRLF', () => {
    const text = 'Example:\r\n```c-sharp\r\nvar x = 1;\r\n```\r\ndone';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1, 'hyphenated lang tag + CRLF fenced block not extracted');
    assert.ok(!stripped.includes('var x = 1'));
  });

  // Issue 4: CRLF inline code
  it('does not capture \\r inside inline code match', () => {
    // CRLF: backtick-span must not bleed across the \r before \n
    const text = 'Run `cmd\r\n` and check output';
    const { stripped, slots } = extractCodeBlocks(text);
    // The span contains \r\n — should NOT be treated as a valid inline code token
    assert.equal(slots.size, 0, 'CRLF inside inline code incorrectly matched');
  });

  // Slot shape: { raw, lang }
  it('fenced block with lang tag stores lang correctly', () => {
    const text = 'Example:\n```python\nprint("hi")\n```\ndone';
    const { slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    const [slot] = slots.values();
    assert.equal(slot.lang, 'python');
    assert.ok(slot.raw.includes('print("hi")'));
  });

  it('fenced block with no lang tag stores lang as empty string', () => {
    const text = 'Example:\n```\nsome code\n```\ndone';
    const { slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    const [slot] = slots.values();
    assert.equal(slot.lang, '');
    assert.ok(slot.raw.includes('some code'));
  });

  it('inline code stores lang as empty string', () => {
    const text = 'Call `myFunc()` here';
    const { slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    const [slot] = slots.values();
    assert.equal(slot.lang, '');
    assert.ok(slot.raw.includes('myFunc'));
  });
});
