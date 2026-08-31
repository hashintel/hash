import { createOpenAIRealtimeCallHandler } from "../../src/server/voice/openai-realtime-call";
import { reportVoiceDiagnostic } from "../../src/voice-diagnostics";

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
