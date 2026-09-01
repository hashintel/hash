import { createOpenAISpeechHandler } from "../../src/server/voice/openai-speech";
import { reportVoiceDiagnostic } from "../../src/voice-diagnostics";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createOpenAISpeechHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
    reportDiagnostic: reportVoiceDiagnostic,
  }),
};
