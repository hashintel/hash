import { createContext } from "react";

import type {
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  SignatureHelp,
} from "./worker/protocol";

export interface LanguageClientContextValue {
  /** Per-URI diagnostics pushed from the language server. */
  diagnosticsByUri: Map<DocumentUri, Diagnostic[]>;
  /** Total number of diagnostics across all documents. */
  totalDiagnosticsCount: number;
  /** Notify the server that a document's content changed. */
  notifyDocumentChanged: (uri: DocumentUri, text: string) => void;
  /** Request completions at a position within a document. */
  requestCompletion: (
    uri: DocumentUri,
    offset: number,
  ) => Promise<CompletionList>;
  /** Request hover info at a position within a document. */
  requestHover: (uri: DocumentUri, offset: number) => Promise<Hover>;
  /** Request signature help at a position within a document. */
  requestSignatureHelp: (
    uri: DocumentUri,
    offset: number,
  ) => Promise<SignatureHelp>;
}

const DEFAULT_CONTEXT_VALUE: LanguageClientContextValue = {
  diagnosticsByUri: new Map(),
  totalDiagnosticsCount: 0,
  notifyDocumentChanged: () => {},
  requestCompletion: () => Promise.resolve({ items: [] }),
  requestHover: () => Promise.resolve(null),
  requestSignatureHelp: () => Promise.resolve(null),
};

export const LanguageClientContext = createContext<LanguageClientContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
