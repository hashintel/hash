/** Provider allowlists shared by the browser picker and session-creation boundary. */
export const voiceNames = {
  realtime: [
    "marin",
    "cedar",
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
  ],
  live: [
    "marin",
    "quartz",
    "ripple",
    "vesper",
    "willow",
    "stone",
    "gleam",
    "meridian",
    "bossa",
    "tempo",
    "beacon",
    "delta",
    "cinder",
  ],
} as const;

export type VoiceProvider = keyof typeof voiceNames;
export const voicePreferenceHeader = "x-petrinaut-voice";

export const isSupportedVoice = (
  provider: VoiceProvider,
  voice: string,
): boolean => voiceNames[provider].some((name) => name === voice);
