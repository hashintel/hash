/**
 * Voice mode as a Petrinaut plugin: the manifest and its binding. It has no
 * assistant of its own: it requires Brunch's conversation and extends
 * Brunch's assistant. The body runs in `plugin/use-voice-plugin.tsx`.
 */

import {
  definePetrinautPlugin,
  definePluginManifest,
} from "@hashintel/petrinaut/ui";

import { BrunchConversation } from "../_shared/brunch-conversation";
import { useVoicePlugin } from "./plugin/use-voice-plugin";

export const voiceManifest = definePluginManifest({
  id: "website.voice",
  name: "Voice",
  description:
    "Talk to Brunch instead of typing: live or realtime speech in, spoken answers and captions out.",
  author: "HASH",
  flags: {
    voice: {
      default: true,
      label: "Voice",
      description:
        "Talk to Brunch instead of typing, when the deployment has voice credentials.",
    },
    realtime: {
      default: false,
      label: "Realtime transcription",
      description: "Use the OpenAI Realtime session instead of Live.",
    },
  },
  requires: { brunch: BrunchConversation },
  assistant: { extends: "website.brunch" },
});
export type VoiceManifest = typeof voiceManifest;

export const voicePlugin = definePetrinautPlugin(voiceManifest, useVoicePlugin);
