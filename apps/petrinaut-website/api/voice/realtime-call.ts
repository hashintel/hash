import { createPetrinautAiGuard } from "../../src/server/auth/petrinaut-auth";
import { createOpenAIRealtimeCallHandler } from "../../src/server/voice/openai-realtime-call";
import { reportVoiceDiagnostic } from "../../src/voice-diagnostics";

declare const process: {
  env: Record<string, string | undefined>;
};

const handleRealtimeCall = createOpenAIRealtimeCallHandler({
  environment: process.env,
  fetch: globalThis.fetch.bind(globalThis),
  reportDiagnostic: reportVoiceDiagnostic,
});

/**
 * A realtime call bills for as long as it stays open, so this route is guarded
 * before anything else runs.
 *
 * The handler's own `Origin` check stays where it is, but it was never an
 * authorization boundary: `Origin` is a request header, and a caller that is
 * not a browser writes whatever it likes in it.
 */
export default {
  fetch: createPetrinautAiGuard(process.env)((request) =>
    handleRealtimeCall(request),
  ),
};
