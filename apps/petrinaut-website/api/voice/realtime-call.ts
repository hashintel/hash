import { createOpenAIRealtimeCallHandler } from "../../src/server/voice/openai-realtime-call.js";
import { reportVoiceDiagnostic } from "../../src/voice-diagnostics.js";

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
