import {
  createOpenAIRealtimeCallHandler,
  reportVoiceDiagnostic,
} from "@hashintel/brunch-agent/server";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createOpenAIRealtimeCallHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
    reportDiagnostic: reportVoiceDiagnostic,
  }),
};
