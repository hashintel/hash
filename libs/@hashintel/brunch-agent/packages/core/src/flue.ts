import {
  defineTool,
  useDataWriter,
  useModel,
  useSkill,
  useTool,
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

/**
 * Mount the contributions owned by Brunch core and return its system prompt.
 *
 * Core contributes the always-on universal prompt, one `elicitation`
 * capability skill, and the formalism-independent question marker.
 */
export function useBrunchAgent(model: string): string {
  useModel(model);
  useSkill(elicitationSkill);
  const writeQuestion = useDataWriter(BRUNCH_QUESTION_DATA_NAME, {
    schema: BrunchQuestionDataSchema,
  });
  useTool(createBrunchQuestionMarkerTool(writeQuestion));
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

export { ELICITATION_SKILL_NAME, elicitationSkill, skillFromMarkdown };
