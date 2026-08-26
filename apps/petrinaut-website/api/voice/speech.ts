import { createOpenAISpeechHandler } from "../../src/server/voice/openai-speech";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createOpenAISpeechHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};
