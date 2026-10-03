import { createReadableStore } from "@hashintel/petrinaut-core";

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
}) =>
  definePetrinautPlugin(
    { id: input.id, name: input.label, assistant: { label: input.label } },
    () => ({ assistant: { chat: createReadableStore(input.assistant) } }),
  );
