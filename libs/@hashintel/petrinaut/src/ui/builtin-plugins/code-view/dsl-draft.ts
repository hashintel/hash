/**
 * What a draft of the Code view's text means for the net: the pure analysis
 * the view renders its diagnostics from and applies on request.
 */

import {
  mergeDslDocument,
  parsePetrinautDsl,
  type DslDiagnostic,
  type SDCPN,
} from "@hashintel/petrinaut-core";

export type DslDraftAnalysis = {
  diagnostics: readonly DslDiagnostic[];
  /** The net the text describes, once every line parses and every reference resolves. */
  net: SDCPN | null;
  /** The title on the `net` line, `null` when the line has none. */
  title: string | null;
};

/** `text` read and merged onto `current`, the net it edits. */
export const analyzeDslDraft = (
  current: SDCPN,
  text: string,
): DslDraftAnalysis => {
  const parsed = parsePetrinautDsl(text);
  const { title } = parsed.document;
  if (parsed.diagnostics.some(({ severity }) => severity === "error")) {
    return { diagnostics: parsed.diagnostics, net: null, title };
  }
  const merged = mergeDslDocument(current, parsed.document);
  return {
    diagnostics: [...parsed.diagnostics, ...merged.diagnostics],
    net: merged.ok ? merged.sdcpn : null,
    title,
  };
};

export const countErrors = (diagnostics: readonly DslDiagnostic[]): number =>
  diagnostics.filter(({ severity }) => severity === "error").length;
