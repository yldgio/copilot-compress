/**
 * copilot-compress — Copilot CLI extension
 * Algorithmically compresses user prompts to reduce token consumption.
 * Toggle: /compress on|off|lite|standard|aggressive|verbose|status
 * Supports EN + IT. Zero LLM calls.
 */

import { joinSession } from "@github/copilot-sdk/extension";
import { compressText } from "./src/compress.mjs";
import { extractCodeBlocks, restoreCodeBlocks } from "./src/code-blocks.mjs";
import { detectLang } from "./src/lang-detect.mjs";
import { looksLikeDataFormat } from "./src/data-format.mjs";
import { validate } from "./src/validator.mjs";

// ─── Session state ────────────────────────────────────────────────────────────
let session;
let intensity   = 'off'; // 'off' | 'lite' | 'standard' | 'aggressive'
let verboseMode = false;
let stats = { originalChars: 0, compressedChars: 0, messageCount: 0 };

// ─── /compress command handler ────────────────────────────────────────────────
async function handleCompressCommand(context) {
  const sub = (context.args ?? '').trim().toLowerCase();

  if (sub === 'on') {
    intensity = 'standard'; // backward compat: /compress on → standard
    await session.log('Compression **ON** (standard) — lang: auto-detect, EN/IT');
    return;
  }
  if (sub === 'off') {
    intensity = 'off';
    await session.log('Compression **OFF**');
    return;
  }
  if (sub === 'lite' || sub === 'standard' || sub === 'aggressive') {
    intensity = sub;
    await session.log(`Compression **ON** (${intensity}) — lang: auto-detect, EN/IT`);
    return;
  }
  if (sub === 'verbose') {
    verboseMode = !verboseMode;
    await session.log(`Verbose ${verboseMode ? '**ON**' : '**OFF**'}`);
    return;
  }
  if (sub === 'status' || sub === '') {
    const tokensSaved = Math.round((stats.originalChars - stats.compressedChars) / 4);
    if (intensity === 'off') {
      await session.log(
        `Compression: **OFF** · Verbose: ${verboseMode ? '**ON**' : '**OFF**'}`,
      );
    } else {
      await session.log([
        `Compression: **ON** (${intensity}) · Verbose: ${verboseMode ? '**ON**' : '**OFF**'}`,
        `Session: ${stats.messageCount} msgs compressed, ~${tokensSaved.toLocaleString()} tokens saved`,
      ].join('\n'));
    }
    return;
  }
  await session.log('Unknown subcommand. Usage: `/compress on|off|lite|standard|aggressive|verbose|status`');
}

// ─── Extension entry point ────────────────────────────────────────────────────
session = await joinSession({
  commands: [
    {
      name: "compress",
      description: "Toggle algorithmic prompt compression. Subcommands: on, off, lite, standard, aggressive, verbose, status.",
      handler: handleCompressCommand,
    },
  ],
  hooks: {
    onUserPromptSubmitted: async (input) => {
      const text = (input.prompt ?? '').trim();
      if (!text) return undefined;

      // Pass-through when disabled
      if (intensity === 'off') return undefined;

      // Compression pipeline
      try {
        const originalLen = text.length;

        // Step 1: full-message data format bypass (before block extraction)
        if (looksLikeDataFormat(text)) {
          return; // return void = no modification, original prompt used
        }

        const { stripped, slots } = extractCodeBlocks(text, intensity);
        const lang = detectLang(stripped);
        const compressedStripped = compressText(stripped, lang, intensity);
        const finalText = restoreCodeBlocks(compressedStripped, slots);

        if (!validate(text, finalText)) {
          if (verboseMode) session.log('⚠️ Validator: invariant failed, using original prompt');
          return; // void = no modification, original prompt used
        }

        const compressedLen = finalText.length;
        const pct = Math.round((1 - compressedLen / originalLen) * 100);

        // Update session stats
        stats.originalChars   += originalLen;
        stats.compressedChars += compressedLen;
        stats.messageCount    += 1;

        // Build LLM note
        const note = `\n\n_(raw message compressed: ${originalLen.toLocaleString()} → ${compressedLen.toLocaleString()} chars, -${pct}%)_`;

        // Verbose line (ephemeral — shown in session, not sent to LLM)
        if (verboseMode) {
          const tokensSaved = Math.round((originalLen - compressedLen) / 4);
          session.log(
            `[compress] ${originalLen.toLocaleString()} → ${compressedLen.toLocaleString()} chars (-${pct}%) · ~${tokensSaved.toLocaleString()} tokens saved`,
            { ephemeral: true },
          ).catch(() => {});
        }

        return { modifiedPrompt: finalText + note };
      } catch {
        // Never crash the hook — return undefined = pass through unchanged
        return undefined;
      }
    },
  },
});
