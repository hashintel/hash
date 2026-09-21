import { createUtteranceJudgmentHandler } from "../../src/server/voice/typesafe-utterance-judgment.js";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createUtteranceJudgmentHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};
