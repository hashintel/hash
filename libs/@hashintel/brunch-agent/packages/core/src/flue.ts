/**
 * Brunch core's agent composition. It mounts a packaged SKILL.md, so only code
 * built by Flue may import this entry; everything else lives on the main entry.
 */
import {
  type CompactionConfig,
  useModel,
  useSkill,
  useTool,
} from "@flue/runtime";

import elicitationSkill from "@hashintel/brunch-agent/skills/elicitation/SKILL.md";

import {
  createLedgerCommitTool,
  createLedgerCompileTool,
  type LedgerServices,
} from "./ledger-tools";
import systemPrompt from "./prompts/SYSTEM.md?raw";

type BrunchModelOptions = {
  compaction?: CompactionConfig;
  thinkingLevel?: NonNullable<Parameters<typeof useModel>[1]>["thinkingLevel"];
};

/**
 * Mount the contributions owned by Brunch core and return its system prompt:
 * the universal prompt, the `elicitation` capability skill, and the Ledger
 * tools, whose only state is the conversation's own history.
 */
export function useBrunchAgent(
  model: string,
  options: BrunchModelOptions | undefined,
  ledger: LedgerServices,
): string {
  useModel(model, options);
  useSkill(elicitationSkill);
  useTool(createLedgerCommitTool(ledger));
  useTool(createLedgerCompileTool(ledger));
  return systemPrompt.replace(/^\s+|\s+$/gu, "");
}
