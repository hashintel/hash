import { createOpenAITranscriptionSessionHandler } from "@hashintel/brunch-agent/server";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createOpenAITranscriptionSessionHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};
