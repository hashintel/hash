/**
 * @layerRoot core.lsp
 * @role Language-server client and transport for editing user code in the net
 */

export {
  createLanguageClient,
  type CreateLanguageClientConfig,
  type DiagnosticsSnapshot,
  type LanguageClient,
} from "./language-client";
export {
  createWorkerLspTransport,
  type LspTransport,
  type LspWorkerFactory,
} from "./transport";

export {
  CompletionItemKind,
  CompletionItemTag,
  DiagnosticSeverity,
  DiagnosticTag,
  MarkupKind,
  Position,
  Range,
} from "vscode-languageserver-types";
export type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  MarkupContent,
  SignatureHelp,
  TextDocumentIdentifier,
} from "vscode-languageserver-types";

export type { NetAnalysis } from "./worker/protocol";
