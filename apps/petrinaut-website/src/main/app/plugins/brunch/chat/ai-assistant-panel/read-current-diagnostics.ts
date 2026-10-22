import { formatDiagnosticsForAi } from "./format-diagnostics-for-ai";

import type { PluginDocumentReader } from "@hashintel/petrinaut/ui/plugin";

/**
 * A worker response belongs to its captured definition, not to the latest
 * diagnostic list. `diagnose` checks the net it returns; a document's
 * extensions are fixed for its plugin `api`, which remounts per document.
 */
export const readCurrentDiagnostics = async (
  document: Pick<PluginDocumentReader, "net" | "diagnose">,
): Promise<string> => {
  const { net: definition, byUri } = await document.diagnose();
  if (document.net.get() !== definition) {
    return "The model changed while diagnostics were running; check again before relying on compilation results.";
  }
  return formatDiagnosticsForAi({ definition, diagnosticsByUri: byUri });
};
