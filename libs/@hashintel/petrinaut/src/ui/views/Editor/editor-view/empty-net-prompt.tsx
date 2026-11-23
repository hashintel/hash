import { usePetrinautDefinitionSelector } from "../../../../react/document/use-document";
import {
  useEditorActions,
  useEditorState,
} from "../../../../react/state/editor-context";
import { usePluginAssistant } from "../../../plugins/plugin-assistant";
import { usePluginOverlay } from "../../../plugins/running-plugins";
import { AiCtaModal } from "./empty-net-prompt/ai-cta-modal";

import type { SDCPN } from "@hashintel/petrinaut-core";

const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0;

/**
 * Asks what to build while the net is empty and hands the answer to the
 * plugin assistant's `onPrompt`. Shown while an assistant takes prompts, its
 * panel is closed and no plugin covers the canvas.
 */
export const EmptyNetPrompt = ({ onDismiss }: { onDismiss: () => void }) => {
  const onPrompt = usePluginAssistant()?.contributions.assistant?.onPrompt;
  const isAiAssistantOpen = useEditorState(
    (editor) => editor.isAiAssistantOpen,
  );
  const { setAiAssistantOpen } = useEditorActions();
  // A plugin covering the canvas, such as a tour, holds back the prompt.
  const pluginOverlay = usePluginOverlay();
  const isNetEmpty = usePetrinautDefinitionSelector(isEmptySDCPN);

  if (
    onPrompt === undefined ||
    isAiAssistantOpen ||
    pluginOverlay ||
    !isNetEmpty
  ) {
    return null;
  }

  return (
    <AiCtaModal
      onDismiss={onDismiss}
      onSubmit={(message) => {
        setAiAssistantOpen(true);
        onPrompt(message);
      }}
    />
  );
};
