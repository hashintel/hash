import { createOpenAIVoiceConfigHandler } from "@hashintel/brunch-agent/server";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createOpenAIVoiceConfigHandler(process.env),
};
