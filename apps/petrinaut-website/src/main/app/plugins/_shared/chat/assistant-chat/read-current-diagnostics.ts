import { formatDiagnosticsForAi } from "./format-diagnostics-for-ai";

import type { PluginDocumentReader } from "@hashintel/petrinaut/ui";

/** A worker response belongs to the net it checked, not to the latest diagnostic list. */
export const readCurrentDiagnostics = async (
  document: Pick<PluginDocumentReader, "net" | "diagnose">,
): Promise<string> => {
  const { net, byUri } = await document.diagnose();
  if (document.net.get() !== net) {
    return "The model changed while diagnostics were running; check again before relying on compilation results.";
  }
  return formatDiagnosticsForAi({ definition: net, diagnosticsByUri: byUri });
};
