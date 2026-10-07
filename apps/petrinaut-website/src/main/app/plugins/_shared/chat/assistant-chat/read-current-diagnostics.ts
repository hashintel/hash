import { formatDiagnosticsForAi } from "./format-diagnostics-for-ai";

import type { LanguageClient, Petrinaut } from "@hashintel/petrinaut-core";

/** A worker response belongs to its captured definition, not to the latest diagnostic list. */
export const readCurrentDiagnostics = async (
  instance: Petrinaut,
  requestDiagnostics: LanguageClient["requestDiagnostics"],
): Promise<string> => {
  const definition = instance.definition.get();
  const extensions = instance.extensions;
  const result = await requestDiagnostics(definition, extensions);
  if (
    instance.definition.get() !== definition ||
    instance.extensions !== extensions
  ) {
    return "The model changed while diagnostics were running; check again before relying on compilation results.";
  }
  return formatDiagnosticsForAi({ definition, diagnosticsByUri: result.byUri });
};
