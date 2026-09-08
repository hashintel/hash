import { createPetrinautAiGuard } from "../../src/server/auth/petrinaut-auth";
import { createOpenAIVoiceConfigHandler } from "../../src/server/voice/openai-voice-config";

declare const process: {
  env: Record<string, string | undefined>;
};

const handleVoiceConfig = createOpenAIVoiceConfigHandler(process.env);

/**
 * Guarded with the call route it describes. A signed-out visitor cannot open a
 * voice session, so telling them one is available only offers a dead control.
 */
export default {
  fetch: createPetrinautAiGuard(process.env)((request) =>
    handleVoiceConfig(request),
  ),
};
