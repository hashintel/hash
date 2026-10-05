/**
 * The `aiAssistant` prop of `<Petrinaut>`, run as an assistant plugin.
 * `<Petrinaut>` puts it before the host's plugins, so it is the default
 * assistant, and provides the prop through context, so the plugin stays a
 * module constant and a new configuration only republishes the assistant.
 * The prop's `additionalTab` becomes the assistant's one tab.
 */

import { createContext, use } from "react";

import { Icon } from "@hashintel/ds-components";

import { definePetrinautPlugin } from "./define-petrinaut-plugin";

import type { PetrinautAiAssistant } from "../petrinaut";
import type {
  PetrinautAssistantProvider,
  PetrinautAssistantTab,
} from "./define-petrinaut-plugin";

/** The plugin's id. The Plugins section leaves it out: the host passed a prop, not a plugin. */
export const aiAssistantPropPluginId = "petrinaut.ai-assistant-prop";

/** The `aiAssistant` prop, provided by `<Petrinaut>` around the plugin hosts. */
export const AiAssistantPropContext = createContext<
  PetrinautAiAssistant | undefined
>(undefined);

const useAiAssistantPropPlugin = (): {
  assistant: PetrinautAssistantProvider;
} => {
  const aiAssistant = use(AiAssistantPropContext);
  const additionalTab = aiAssistant?.additionalTab;
  const tabs: readonly PetrinautAssistantTab[] | undefined =
    additionalTab === undefined
      ? undefined
      : [
          {
            id: "additional-tab",
            label: additionalTab.label,
            // The prop's tab was marked only in the Brunch presentation.
            mark:
              aiAssistant?.presentation === "brunch" ? (
                <Icon name="bars" size="xs" />
              ) : undefined,
            activityIdentities: additionalTab.activityIdentities,
            content: additionalTab.content,
          },
        ];

  return { assistant: { chat: aiAssistant ?? null, tabs } };
};

/** Labelled "AI" in the assistant selector and switch commands, which appear only beside other assistants. */
export const aiAssistantPropPlugin = definePetrinautPlugin(
  {
    id: aiAssistantPropPluginId,
    name: "AI assistant",
    assistant: { label: "AI" },
  },
  useAiAssistantPropPlugin,
);
