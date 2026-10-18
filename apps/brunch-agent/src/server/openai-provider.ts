import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";

import type { Provider } from "@earendil-works/pi-ai";

/**
 * The snapshot Petrinaut assistants run by default. Pi's catalogue lists only
 * the undated `gpt-5.5` alias, which points at this snapshot, so the snapshot
 * takes the alias's metadata under its dated id. Read from Pi's catalogue
 * module rather than the provider factory: tests substitute the factory with a
 * faux provider that must still resolve the default model.
 */
const gpt55Snapshot = {
  ...OPENAI_MODELS["gpt-5.5"],
  id: "gpt-5.5-2026-04-23",
  name: "GPT-5.5 (2026-04-23)",
};

/**
 * pi-ai's OpenAI provider plus the dated default snapshot, on every catalogue
 * read. Streams stay the provider's own, so a faux provider under test keeps its
 * responses. Delete this module and register `openaiProvider()` once Pi lists
 * the snapshot.
 */
export const openaiProviderWithAddedModels = (): Provider => {
  const catalogue = openaiProvider();
  return {
    ...catalogue,
    getModels: () => [...catalogue.getModels(), gpt55Snapshot],
    getAllModels: () => [
      ...(catalogue.getAllModels?.() ?? catalogue.getModels()),
      gpt55Snapshot,
    ],
  };
};
