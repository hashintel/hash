import { definePetrinautPlugin } from "./define-petrinaut-plugin";

import type { PetrinautAiAssistant } from "../petrinaut";

/**
 * A plugin whose assistant is one fixed chat configuration: the simplest
 * assistant plugin, for stories, tests and hosts with a single transport.
 */
export const createAssistantPlugin = (input: {
  id: string;
  label: string;
  assistant: PetrinautAiAssistant;
}) => {
  const providers = { assistant: { chat: input.assistant } };

  return definePetrinautPlugin(
    { id: input.id, name: input.label, assistant: { label: input.label } },
    () => providers,
  );
};
