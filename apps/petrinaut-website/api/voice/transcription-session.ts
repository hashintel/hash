import { createOpenAITranscriptionSessionHandler } from "../../src/server/voice/openai-transcription-session.js";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createOpenAITranscriptionSessionHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};
