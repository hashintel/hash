/**
 * Brunch core's agent composition. It mounts a packaged SKILL.md, so only code
 * built by Flue may import this entry; everything else lives on the main entry.
 */
import {
  type CompactionConfig,
  useModel,
  usePersistentState,
  useSkill,
  useTool,
} from "@flue/runtime";

import elicitationSkill from "@hashintel/brunch-agent/skills/elicitation/SKILL.md";

import { brunchStateKeys } from "./constants";
import systemPrompt from "./prompts/SYSTEM.md?raw";
import {
  type WorkpieceEvidenceServices,
  type WorkpieceRevision,
} from "./workpiece";
import { createMutateWorkpieceTool } from "./workpiece-tools";

/**
 * Mount the contributions owned by Brunch core and return its system prompt.
 *
 * Core contributes the always-on universal prompt, one `elicitation`
 * capability skill, and durable workpiece revisions.
 */
type BrunchModelOptions = {
  compaction?: CompactionConfig;
  thinkingLevel?: NonNullable<Parameters<typeof useModel>[1]>["thinkingLevel"];
};

export function useBrunchAgent(
  model: string,
  options?: BrunchModelOptions,
  consumeRevision?: (revision: WorkpieceRevision | null) => void,
  readEvidenceSources?: (
    current: WorkpieceRevision | null,
  ) => ReturnType<WorkpieceEvidenceServices["readSources"]>,
  allowIndependentBrowserCalls = false,
): string {
  useModel(model, options);
  useSkill(elicitationSkill);
  const [revision, setRevision] = usePersistentState<WorkpieceRevision | null>(
    brunchStateKeys.workpieceRevision,
    null,
  );
  useTool(
    createMutateWorkpieceTool(setRevision, {
      currentRevision: revision,
      allowIndependentBrowserCalls,
      readSources: () => readEvidenceSources?.(revision) ?? Promise.resolve([]),
    }),
  );
  // Composition reads this render's single authority, never a second registration.
  consumeRevision?.(revision);
  return systemPrompt.replace(/^\s+|\s+$/gu, "");
}
