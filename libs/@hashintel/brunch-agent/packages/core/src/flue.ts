import {
  type CompactionConfig,
  defineTool,
  useDataWriter,
  useModel,
  usePersistentState,
  useSkill,
  useTool,
  type StateSetter,
} from "@flue/runtime";
import * as v from "valibot";

import systemPrompt from "./prompts/SYSTEM.md?raw";
import {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
  BrunchQuestionDataSchema,
  BrunchQuestionInputSchema,
  type BrunchQuestionData,
} from "./question-marker";
import {
  ELICITATION_SKILL_NAME,
  elicitationSkill,
} from "./skills/elicitation/skill";
import { skillFromMarkdown } from "./skills/skill-markdown";
import {
  prepareWorkpieceRevision,
  updateWorkpieceInputSchema,
} from "./update-workpiece";
import { workpieceRevisionStateKey, type WorkpieceRevision } from "./workpiece";

/**
 * Mount the contributions owned by Brunch core and return its system prompt.
 *
 * Core contributes the always-on universal prompt, one `elicitation`
 * capability skill, the question marker, and durable workpiece revisions.
 */
export function useBrunchAgent(
  model: string,
  compaction?: CompactionConfig,
): string {
  useModel(model, compaction === undefined ? undefined : { compaction });
  useSkill(elicitationSkill);
  const writeQuestion = useDataWriter(BRUNCH_QUESTION_DATA_NAME, {
    schema: BrunchQuestionDataSchema,
  });
  useTool(createBrunchQuestionMarkerTool(writeQuestion));
  const [, setRevision] = usePersistentState<WorkpieceRevision | null>(
    workpieceRevisionStateKey,
    null,
  );
  useTool(createUpdateWorkpieceTool(setRevision));
  return systemPrompt.replace(/^\s+|\s+$/gu, "");
}

export const createBrunchQuestionMarkerTool = (
  writeQuestion: (question: BrunchQuestionData) => void,
) =>
  defineTool({
    name: BRUNCH_QUESTION_TOOL_NAME,
    description:
      "Mark the exact text of a direct question for accessible replay. Call this immediately before including that exact question in ordinary assistant prose. This marker does not ask or answer the question itself.",
    input: BrunchQuestionInputSchema,
    output: v.object({ marked: v.literal(true) }),
    run({ data, toolCallId }) {
      writeQuestion({ question: data.question, toolCallId });
      return { output: { marked: true as const } };
    },
  });

export const createUpdateWorkpieceTool = (
  setRevision: StateSetter<WorkpieceRevision | null>,
) =>
  defineTool({
    name: "update_workpiece",
    description:
      "Settle the full current Markdown workpiece and return its revisionId and SHA-256. This server tool does not end the response. Never combine it with browser construction in one batch. Optional evidence is unverified carriage, not proof of user support.",
    input: updateWorkpieceInputSchema,
    output: v.object({
      revisionId: v.string(),
      sha256: v.string(),
      ordinal: v.number(),
    }),
    durable: true,
    run({ data, toolCallId }) {
      const revision = prepareWorkpieceRevision(data, toolCallId);
      const pointer = {
        revisionId: revision.revisionId,
        sha256: revision.sha256,
        ordinal: 0,
      };
      // Buffered state commits with the tool batch, not an external effect. A
      // separate step checkpoint could skip an uncommitted write on replay.
      setRevision((previous) => {
        pointer.ordinal =
          previous?.revisionId === toolCallId
            ? previous.ordinal
            : (previous?.ordinal ?? 0) + 1;
        return { ...revision, ordinal: pointer.ordinal };
      });
      return { output: pointer, terminate: false };
    },
  });

export { ELICITATION_SKILL_NAME, elicitationSkill, skillFromMarkdown };
export {
  workpieceMarkdownByteCeiling,
  updateWorkpieceInputSchema,
} from "./update-workpiece";
