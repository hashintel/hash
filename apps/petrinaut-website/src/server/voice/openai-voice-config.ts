import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

import type { UtteranceJudgmentMode } from "../../shared/live-utterance-judgment.js";
import type { VoiceProvider } from "../../shared/voice-settings.js";

interface VoiceEnvironment {
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly PETRINAUT_VOICE_PROVIDER?: string;
  readonly PETRINAUT_LIVE_UTTERANCE_JUDGMENT?: string;
  readonly TYPESAFE_API_KEY?: string;
  readonly VERCEL_ENV?: string;
  readonly NODE_ENV?: string;
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

/**
 * The log-only experiment runs in local development and on Vercel preview
 * deployments; production rollout is not approved. Other modes remain off.
 */
export const getUtteranceJudgmentMode = (
  environment: VoiceEnvironment,
): UtteranceJudgmentMode => {
  const permittedDeployment =
    environment.VERCEL_ENV === "preview" ||
    (environment.NODE_ENV === "development" && !environment.VERCEL_ENV);
  if (
    !permittedDeployment ||
    !getOpenAIVoiceAvailability(environment).available ||
    getVoiceProvider(environment) !== "live" ||
    !environment.TYPESAFE_API_KEY?.trim()
  )
    return "off";
  return environment.PETRINAUT_LIVE_UTTERANCE_JUDGMENT === "log"
    ? "log"
    : "off";
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
        utteranceJudgment: getUtteranceJudgmentMode(environment),
      },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  };
