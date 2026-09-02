import type {
  PetrinautAiComposerControl,
  PetrinautAiComposerControlContext,
  PetrinautAiVoiceMode,
  PetrinautAiVoiceModeContext,
} from "../../../../types/ai-assistant-composer-control";

export const AiAssistantComposerControl = ({
  context,
  renderControl,
}: {
  context: PetrinautAiComposerControlContext;
  renderControl: PetrinautAiComposerControl;
}) => renderControl(context);

export const AiAssistantVoiceMode = ({
  context,
  renderVoiceMode,
}: {
  context: PetrinautAiVoiceModeContext;
  renderVoiceMode: PetrinautAiVoiceMode;
}) => renderVoiceMode(context);
