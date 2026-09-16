import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

interface VoiceEnvironment {
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly PETRINAUT_VOICE_PROVIDER?: string;
  readonly VERCEL_ENV?: string;
}

export const getVoiceProvider = (environment: VoiceEnvironment) => {
  const provider = environment.PETRINAUT_VOICE_PROVIDER ?? "realtime";
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
