import {
  defineTool,
  useDataWriter,
  useInstruction,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import {
  BRUNCH_VOICE_DATA_NAME,
  BRUNCH_VOICE_TOOL_NAME,
  BrunchVoiceDataSchema,
  BrunchVoiceInputSchema,
} from "@hashintel/brunch-agent/voice-response";

/** App-owned delivery instructions and output, mounted only for Voice deliveries. */
export const useVoiceResponse = (): void => {
  const writeSpeech = useDataWriter(BRUNCH_VOICE_DATA_NAME, {
    schema: BrunchVoiceDataSchema,
  });
  useTool(
    defineTool({
      name: BRUNCH_VOICE_TOOL_NAME,
      description:
        "Author the spoken answer or takeaway for this Voice reply after gathering its tool evidence. This records text, not playback or completion. Then deliver the full visible response in ordinary assistant prose. If further substantive tools are needed, replace the speech after their results.",
      input: BrunchVoiceInputSchema,
      output: v.object({ title: v.string(), detail: v.string() }),
      run({ data, toolCallId }) {
        writeSpeech({ speech: data.speech, toolCallId });
        return {
          output: {
            title: "Brunch-authored speech (not playback confirmation)",
            detail: data.speech,
          },
        };
      },
    }),
  );
  useInstruction(`Voice response style for this delivery only:
Author both the spoken content and the complete visible canonical response. Realtime reads your spoken content verbatim; it does not select, summarize, or add meaning.
For a short answer, give a brief useful answer, then ask a follow-up only when it materially advances the person's modelling goal. Do not force a follow-up every turn. Clarify first when ambiguity would materially change the answer.
For a long analysis, author a brief substantive takeaway for speech while keeping the complete report and required recoverable workpiece in ordinary visible prose. Preserve consequential qualifications in the takeaway, not only on screen. Avoid unnecessary preambles and repetition.
Voice delivery order (including clarification-only replies):
1. Finish gathering the evidence and substantive tool results needed for this reply.
2. Call brunch_set_voice_response with the exact spoken answer, takeaway, or clarification question. A clarification-only reply still needs authored speech; use the exact question text when speaking a question.
3. If asking a direct question, call brunch_mark_question with its exact text immediately before presenting it in ordinary assistant prose. The speech tool does not replace question marking.
4. Deliver the full visible response, including the exact marked question text, then finish. Do not skip speech authoring when the visible response is only a question.
If another substantive tool is needed after speech authoring, replace the spoken content after that tool's result before final delivery. Do not claim a change or successful check before its evidence exists.
The application waits for the whole reply, including browser-tool continuations, before playback. Read full response reads the complete visible prose on request. Recording speech is not evidence of playback, user agreement, or completed modelling.
These are presentation instructions only. Retain all domain, evidence, workpiece, and tool obligations.`);
};
