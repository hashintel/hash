import type { AssistantSelection } from "./assistant-selection";
import type { PetrinautLabsSetting } from "@hashintel/petrinaut/ui";

export const assistantLabsSettingKey = "demo-assistant";

/**
 * The editor's Labs entry for the assistant choice, empty unless a Brunch
 * endpoint is configured and the route leaves the choice open. It shares
 * `selectAssistant` with the palette command, so the two surfaces read and
 * write one preference.
 */
export const assistantLabsSettings = ({
  brunchSelected,
  canSelectAssistant,
  isBrunchConfigured,
  selectAssistant,
}: {
  brunchSelected: boolean;
  canSelectAssistant: boolean;
  isBrunchConfigured: boolean;
  selectAssistant: (selection: AssistantSelection) => void;
}): PetrinautLabsSetting[] =>
  isBrunchConfigured && canSelectAssistant
    ? [
        {
          key: assistantLabsSettingKey,
          group: "Assistant",
          label: "Brunch assistant",
          description:
            "Use Brunch in the AI panel instead of the stock Petrinaut assistant, with voice where it is offered.",
          value: brunchSelected,
          onChange: (value) => selectAssistant(value ? "brunch" : "stock"),
        },
      ]
    : [];
