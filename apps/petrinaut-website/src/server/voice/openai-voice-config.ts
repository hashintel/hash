import { getOpenAIVoiceAvailability } from "./openai-voice-policy";

interface VoiceEnvironment {
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly VERCEL_ENV?: string;
}

export const createOpenAIVoiceConfigHandler =
  (environment: VoiceEnvironment) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return new Response("Method not allowed.", {
        status: 405,
        headers: { allow: "GET", "cache-control": "no-store" },
      });
    }

    return Response.json(getOpenAIVoiceAvailability(environment), {
      headers: { "cache-control": "no-store" },
    });
  };
