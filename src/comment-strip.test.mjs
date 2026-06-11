import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { stripComments } from './comment-strip.mjs';
import { isDataFormatLang } from './data-format.mjs';

describe('stripComments — JS', () => {
  it('strips // line comment', () => {
    const out = stripComments('// top-level comment\nconst x = 1;', 'js');
    assert.ok(!out.includes('// top-level comment'), 'line comment not stripped');
    assert.ok(out.includes('const x = 1;'));
  });

  it('strips /* block comment */', () => {
    const out = stripComments('/* block */\nconst x = 1;', 'js');
    assert.ok(!out.includes('block'), 'block comment not stripped');
    assert.ok(out.includes('const x = 1;'));
  });

  it('strips trailing inline // comment', () => {
    const out = stripComments('const x = 1; // inline\nconst y = 2;', 'js');
    assert.ok(!out.includes('inline'), 'inline comment not stripped');
    assert.ok(out.includes('const x = 1'));
    assert.ok(out.includes('const y = 2'));
  });

  it('does not strip :// inside a string literal', () => {
    const code = 'const x = "url://example";';
    assert.equal(stripComments(code, 'js'), code);
  });

  it('accepts "javascript" as alias', () => {
    const out = stripComments('// comment\nconst x = 1;', 'javascript');
    assert.ok(!out.includes('// comment'));
  });

  it('accepts "ts" and "typescript" aliases', () => {
    const ts = stripComments('// ts comment\nconst x: number = 1;', 'ts');
    assert.ok(!ts.includes('// ts comment'));
    const typescript = stripComments('// ts comment\nconst x: number = 1;', 'typescript');
    assert.ok(!typescript.includes('// ts comment'));
  });
});

describe('stripComments — Python', () => {
  it('strips # line comment', () => {
    const out = stripComments('# comment\nx = 1', 'python');
    assert.ok(!out.includes('# comment'), 'Python # comment not stripped');
    assert.ok(out.includes('x = 1'));
  });

  it('strips """ triple-quoted docstring """', () => {
    const out = stripComments('def f():\n    """This is a docstring."""\n    return 1', 'py');
    assert.ok(!out.includes('This is a docstring'), 'docstring not stripped');
    assert.ok(out.includes('return 1'));
  });

  it("strips ''' triple-quoted docstring '''", () => {
    const out = stripComments("def f():\n    '''docstring'''\n    return 1", 'py');
    assert.ok(!out.includes('docstring'), "single-quoted docstring not stripped");
    assert.ok(out.includes('return 1'));
  });

  it('accepts "py" as alias', () => {
    const out = stripComments('# comment\nx = 1', 'py');
    assert.ok(!out.includes('# comment'));
  });
});

describe('stripComments — Rust', () => {
  it('strips // comment (same pattern as JS)', () => {
    const out = stripComments('// comment\nfn main() {}', 'rs');
    assert.ok(!out.includes('// comment'), 'Rust // comment not stripped');
    assert.ok(out.includes('fn main()'));
  });

  it('accepts "rust" as alias', () => {
    const out = stripComments('// comment\nfn main() {}', 'rust');
    assert.ok(!out.includes('// comment'));
  });
});

describe('stripComments — Go', () => {
  it('strips // comment (same pattern as JS)', () => {
    const out = stripComments('// comment\nfunc main() {}', 'go');
    assert.ok(!out.includes('// comment'), 'Go // comment not stripped');
    assert.ok(out.includes('func main()'));
  });
});

describe('stripComments — Shell', () => {
  it('strips # line comment', () => {
    const out = stripComments('# comment\necho hello', 'sh');
    assert.ok(!out.includes('# comment'), 'shell # comment not stripped');
    assert.ok(out.includes('echo hello'));
  });

  it('accepts "bash" and "zsh" aliases', () => {
    const bash = stripComments('# comment\necho hi', 'bash');
    assert.ok(!bash.includes('# comment'));
    const zsh = stripComments('# comment\necho hi', 'zsh');
    assert.ok(!zsh.includes('# comment'));
  });
});

describe('stripComments — passthrough cases', () => {
  it('returns original unchanged for unsupported lang (ruby)', () => {
    const code = '# this is ruby\nputs "hello"';
    assert.equal(stripComments(code, 'ruby'), code);
  });

  it('returns original unchanged for empty lang string', () => {
    const code = '// some code';
    assert.equal(stripComments(code, ''), code);
  });

  it('is case-insensitive for lang tag', () => {
    const out = stripComments('// comment\nconst x = 1;', 'JS');
    assert.ok(!out.includes('// comment'));
  });
});

describe('stripComments — data format guard (import check)', () => {
  it('isDataFormatLang("json") is true', () => {
    assert.equal(isDataFormatLang('json'), true);
  });

  it('isDataFormatLang("yaml") is true', () => {
    assert.equal(isDataFormatLang('yaml'), true);
  });

  it('isDataFormatLang("js") is false', () => {
    assert.equal(isDataFormatLang('js'), false);
  });
});

describe('stripComments — regression: string literals with comment-like content', () => {
  it('does not corrupt Python string containing # (url fragment)', () => {
    const code = 'url = "https://api.example.com/v1#section"';
    const out = stripComments(code, 'python');
    assert.ok(out.includes('#section'), 'url fragment inside string was incorrectly stripped');
  });

  it('does not corrupt Shell string containing # (anchor)', () => {
    const code = 'curl "https://example.com#anchor"';
    const out = stripComments(code, 'sh');
    assert.ok(out.includes('#anchor'), 'anchor fragment inside string was incorrectly stripped');
  });

  it('does not corrupt JS regex literal containing //', () => {
    const code = 'const re = /https:\\/\\//;';
    const out = stripComments(code, 'js');
    assert.ok(out.includes('/https:\\/\\//'), 'regex literal with // was incorrectly stripped');
  });

  it('still strips Python inline # comment preceded by whitespace', () => {
    const out = stripComments('x = 1  # inline comment\ny = 2', 'python');
    assert.ok(!out.includes('inline comment'), 'inline # comment not stripped');
    assert.ok(out.includes('x = 1'));
    assert.ok(out.includes('y = 2'));
  });

  it('still strips Shell inline # comment preceded by whitespace', () => {
    const out = stripComments('echo hello  # greet\necho world', 'sh');
    assert.ok(!out.includes('greet'), 'inline shell # comment not stripped');
    assert.ok(out.includes('echo hello'));
  });

  it('still strips JS inline // comment preceded by whitespace', () => {
    const out = stripComments('const x = 1; // inline\nconst y = 2;', 'js');
    assert.ok(!out.includes('inline'), 'inline // comment not stripped');
    assert.ok(out.includes('const x = 1'));
  });
});

describe('stripComments — fail-closed', () => {
  it('never throws on null code input', () => {
    assert.doesNotThrow(() => stripComments(null, 'js'));
  });

  it('never throws on undefined code input', () => {
    assert.doesNotThrow(() => stripComments(undefined, 'python'));
  });

  it('never throws on null lang input', () => {
    assert.doesNotThrow(() => stripComments('const x = 1;', null));
  });
});
