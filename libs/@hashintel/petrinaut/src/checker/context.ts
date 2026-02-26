import { createContext } from "react";

import type {
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  Position,
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
    position: Position,
  ) => Promise<CompletionList>;
  /** Request hover info at a position within a document. */
  requestHover: (uri: DocumentUri, position: Position) => Promise<Hover | null>;
  /** Request signature help at a position within a document. */
  requestSignatureHelp: (
    uri: DocumentUri,
    position: Position,
  ) => Promise<SignatureHelp | null>;
}

const DEFAULT_CONTEXT_VALUE: LanguageClientContextValue = {
  diagnosticsByUri: new Map(),
  totalDiagnosticsCount: 0,
  notifyDocumentChanged: () => {},
  requestCompletion: () => Promise.resolve({ isIncomplete: false, items: [] }),
  requestHover: () => Promise.resolve(null),
  requestSignatureHelp: () => Promise.resolve(null),
};

export const LanguageClientContext = createContext<LanguageClientContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
