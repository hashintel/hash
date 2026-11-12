/**
 * Brunch's HASH system prompt on Pi Durable, as the agent's first section.
 *
 * Copied, byte for byte, from `apps/brunch-agent/src/agents/hash/prompts/system.md`
 * into `guidance/prompts/system.md` (HA-2: prompt and skills are copied, not
 * moved), and trimmed as Brunch's `useGuidance` trims it. The drift test
 * fails when the copy differs from Brunch's file.
 *
 * Brunch's other instructions, the interview allowance and preferred
 * spellings, are not ported (HA-6): HASH sends neither.
 */
import { readFileSync } from "node:fs";

import { defineExtension, section } from "@earendil-works/pi-durable";

export const hashSystemPromptFile = new URL(
  "guidance/prompts/system.md",
  import.meta.url,
);

export const hashSystemPrompt = readFileSync(
  hashSystemPromptFile,
  "utf8",
).trim();

export const hashSystemSectionKey = "brunch-hash-system";

/** The prompt, untagged, as Flue's system prompt leads with it. */
export const hashPromptExtension = defineExtension({
  name: "brunch.hash",
  sections: [
    section(hashSystemSectionKey, () => hashSystemPrompt, { tag: false }),
  ],
});
