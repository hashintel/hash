import { use } from "react";

import {
  LanguageClientContext,
  type LanguageClientContextValue,
} from "../lsp/context";

import type { Diagnostic, DocumentUri } from "@hashintel/petrinaut-core";

/**
 * All current diagnostics, grouped by document URI, plus a total count.
 */
export function useDiagnostics(): {
  byUri: Map<DocumentUri, Diagnostic[]>;
  total: number;
} {
  const ctx = use(LanguageClientContext);
  return {
    byUri: ctx.diagnosticsByUri,
    total: ctx.totalDiagnosticsCount,
  };
}

/** Total number of diagnostics across all documents. */
export function useTotalDiagnosticsCount(): number {
  return use(LanguageClientContext).totalDiagnosticsCount;
}

/** Diagnostics for a single document URI. Returns an empty array if none. */
export function useDiagnosticsForUri(uri: DocumentUri): Diagnostic[] {
  const ctx = use(LanguageClientContext);
  return ctx.diagnosticsByUri.get(uri) ?? [];
}

export type LspActionsBundle = {
  notifyDocumentChanged: LanguageClientContextValue["notifyDocumentChanged"];
  requestCompletion: LanguageClientContextValue["requestCompletion"];
  requestHover: LanguageClientContextValue["requestHover"];
  requestSignatureHelp: LanguageClientContextValue["requestSignatureHelp"];
  initializeScenarioSession: LanguageClientContextValue["initializeScenarioSession"];
  updateScenarioSession: LanguageClientContextValue["updateScenarioSession"];
  killScenarioSession: LanguageClientContextValue["killScenarioSession"];
  initializeMetricSession: LanguageClientContextValue["initializeMetricSession"];
  updateMetricSession: LanguageClientContextValue["updateMetricSession"];
  killMetricSession: LanguageClientContextValue["killMetricSession"];
};

/** Bundle of LSP action methods (notifications and request RPCs). */
export function useLspActions(): LspActionsBundle {
  const ctx = use(LanguageClientContext);
  return {
    notifyDocumentChanged: ctx.notifyDocumentChanged,
    requestCompletion: ctx.requestCompletion,
    requestHover: ctx.requestHover,
    requestSignatureHelp: ctx.requestSignatureHelp,
    initializeScenarioSession: ctx.initializeScenarioSession,
    updateScenarioSession: ctx.updateScenarioSession,
    killScenarioSession: ctx.killScenarioSession,
    initializeMetricSession: ctx.initializeMetricSession,
    updateMetricSession: ctx.updateMetricSession,
    killMetricSession: ctx.killMetricSession,
  };
}
