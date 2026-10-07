import { usePluginService } from "@hashintel/petrinaut/ui";

import {
  AssistantChat,
  type AssistantChatProps,
} from "../../_shared/chat/assistant-chat";
import { createVoicePlugin } from "../../voice/definition";

/** Brunch's chat, with the voice mode and captions Voice adds while it runs. */
export const BrunchChat = (props: AssistantChatProps) => {
  const voice = usePluginService(createVoicePlugin);

  return <AssistantChat {...props} {...voice} />;
};
