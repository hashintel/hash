/**
 * @layerRoot core.lsp
 * @layerName LSP client
 * @role Language-server client and transport for editing user code in the net
 * @seam @hashintel/petrinaut-core/workers/lsp
 * @boundary thread — requests reach the language server over a worker transport, so every call is async
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
