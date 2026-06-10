import { defineConfig } from 'rollup';

export default defineConfig({
  input: 'extension.mjs',
  output: {
    file: 'dist/extension.mjs',
    format: 'esm',
    banner: '// Built by rollup — do not edit directly. Edit src/ and run npm run build.',
  },
  external: ['@github/copilot-sdk', '@github/copilot-sdk/extension'],
});
