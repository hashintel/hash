import { formatDiagnosticsForAi } from "./read-diagnostics-for-ai/format-diagnostics-for-ai";

import type { PluginDocumentReader } from "@hashintel/petrinaut/ui";

/**
 * The net's diagnostics formatted for the model. A worker response belongs to
 * the net it checked, so a net that changed during the check reads as a note
 * to check again, never as the latest result.
 */
export const readDiagnosticsForAi = async (
  document: Pick<PluginDocumentReader, "net" | "diagnose">,
): Promise<string> => {
  const { net, byUri } = await document.diagnose();
  if (document.net.get() !== net) {
    return "The model changed while diagnostics were running; check again before relying on compilation results.";
  }
  return formatDiagnosticsForAi({ definition: net, diagnosticsByUri: byUri });
};
