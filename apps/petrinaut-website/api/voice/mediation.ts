import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  createVoiceMediationHandler,
  voiceMediationInstructions,
} from "../../src/server/voice/voice-mediation.js";
import { voiceBriefExtractionSchema } from "../../src/shared/voice-mediation.js";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createVoiceMediationHandler({
    environment: process.env,
    generate: async (input, abortSignal) => {
      // Reuse the website's existing text-model choice and dedicated Voice key.
      const model = createOpenAI({ apiKey: process.env.OPENAI_VOICE_API_KEY })(
        "gpt-5.5-2026-04-23",
      );
      const options = {
        model,
        system: voiceMediationInstructions[input.kind],
        prompt: input.text,
        abortSignal,
        maxRetries: 0,
      };
      if (input.kind === "brief") {
        return (
          await generateText({
            ...options,
            output: Output.object({ schema: voiceBriefExtractionSchema }),
          })
        ).output;
      }
      return (
        await generateText({
          ...options,
          output: Output.object({ schema: z.object({ text: z.string() }) }),
        })
      ).output;
    },
  }),
};
