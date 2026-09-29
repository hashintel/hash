import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

import type { VoiceProvider } from "../../shared/voice-settings.js";

interface VoiceEnvironment {
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly PETRINAUT_VOICE_PROVIDER?: string;
  readonly VERCEL_ENV?: string;
}

/**
 * Live is the default. `PETRINAUT_VOICE_PROVIDER` remains a discovery default
 * for clients without a picker; the website selects its provider in Labs.
 * The enablement flag and API key still decide whether Voice is offered at all.
 */
export const getVoiceProvider = (
  environment: VoiceEnvironment,
): VoiceProvider | null => {
  const provider = environment.PETRINAUT_VOICE_PROVIDER ?? "live";
  return provider === "realtime" || provider === "live" ? provider : null;
};

export const createOpenAIVoiceConfigHandler =
  (environment: VoiceEnvironment) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return new Response("Method not allowed.", {
        status: 405,
        headers: { allow: "GET", "cache-control": "no-store" },
      });
    }

    const availability = getOpenAIVoiceAvailability(environment);
    const provider = getVoiceProvider(environment);
    return Response.json(
      {
        ...availability,
        provider,
        available: availability.available && provider !== null,
      },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  };
