import { definePetrinautPlugin } from "./define-petrinaut-plugin";

import type { PetrinautAiAssistant } from "../petrinaut";

/**
 * Defines a plugin whose assistant is one fixed chat configuration.
 * Use `definePetrinautPlugin` when the chat needs tabs, hooks or the document.
 */
export const createAssistantPlugin = (input: {
  /** Plugin id, unique among the plugins passed to the editor. */
  id: string;
  /** Plugin name in User settings and the assistant's name in the assistant selector. */
  label: string;
  /** Chat configuration the assistant uses for every document. */
  assistant: PetrinautAiAssistant;
}) => {
  const providers = { assistant: { chat: input.assistant } };

  return definePetrinautPlugin(
    { id: input.id, name: input.label, assistant: { label: input.label } },
    () => providers,
  );
};
