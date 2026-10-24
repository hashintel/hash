import {
  createUtteranceJudgmentHandler,
  reportUtteranceJudgmentDiagnostic,
} from "@hashintel/brunch-agent/server";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createUtteranceJudgmentHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
    report: reportUtteranceJudgmentDiagnostic,
  }),
};
