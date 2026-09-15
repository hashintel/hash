import { createOpenAILiveSessionHandler } from "../../src/server/voice/openai-live-session.js";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createOpenAILiveSessionHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};
