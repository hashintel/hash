import {
  type PetrinautAiVoiceMode,
  type PetrinautAiVoiceModeContext,
} from "@hashintel/petrinaut/ui";

import { type OpenAIVoiceConfig } from "../voice-interview/load-openai-voice-config";
import { VoiceInterviewControl } from "../voice-interview/voice-interview-control";

export const getBrunchVoiceMode = (
  config: OpenAIVoiceConfig | null | undefined,
): PetrinautAiVoiceMode | undefined =>
  config
    ? (context: PetrinautAiVoiceModeContext) => (
        <VoiceInterviewControl {...context} config={config} />
      )
    : undefined;
