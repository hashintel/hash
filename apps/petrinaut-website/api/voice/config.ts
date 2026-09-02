import { createOpenAIVoiceConfigHandler } from "../../src/server/voice/openai-voice-config";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createOpenAIVoiceConfigHandler(process.env),
};
