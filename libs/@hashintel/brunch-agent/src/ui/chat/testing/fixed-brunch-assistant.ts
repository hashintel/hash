import type { BrunchAssistantHost } from "../../editor-api-plugin";
import type { PetrinautAiAssistant } from "../petrinaut";

/**
 * A host that holds `assistant` whether or not the editor shows Brunch, for
 * tests that render Brunch's chat in the editor without the demo shell.
 */
export const fixedBrunchAssistant = (
  assistant: PetrinautAiAssistant,
): BrunchAssistantHost => ({
  assistant,
  show: () => () => {},
});
