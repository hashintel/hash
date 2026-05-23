export {
  createLanguageClient,
  type CreateLanguageClientConfig,
  type DiagnosticsSnapshot,
  type LanguageClient,
} from "./language-client";
export { createWorkerLspTransport, type LspTransport, type LspWorkerFactory } from "./transport";

export {
  CompletionItemKind,
  DiagnosticSeverity,
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
