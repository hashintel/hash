import { usePluginService } from "@hashintel/petrinaut/ui/plugin";

import {
  AssistantChat,
  type AssistantChatProps,
} from "../../_shared/chat/assistant-chat";
import { VoicePlugin } from "../../voice/definition";

/** Brunch's chat, with the voice mode and captions Voice adds while it runs. */
export const BrunchChat = (props: AssistantChatProps) => {
  const voice = usePluginService(VoicePlugin);

  return <AssistantChat {...props} {...voice} />;
};
