import { createOpenAIRealtimeCallHandler } from "../../src/server/voice/openai-realtime-call";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createOpenAIRealtimeCallHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};
