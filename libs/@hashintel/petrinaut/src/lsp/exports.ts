/**
 * LSP module public exports.
 */

// Context and Provider
export { LSPContext, type LSPContextValue } from "./lsp-context";
export { LSPProvider, type LSPProviderProps } from "./lsp-provider";

// Client
export { type DiagnosticsListener, LSPClient } from "./lsp-client";

// File path utilities
export {
  getItemInfoFromMonacoPath,
  isSDCPNCodeFile,
  lspPathToMonacoPath,
  monacoPathToLspPath,
} from "./file-path-mapper";

// Protocol types
export type {
  DiagnosticMessageChain,
  LSPNotification,
  LSPRequest,
  LSPResponse,
  LSPWorkerMessage,
  SDCPNItemDiagnostic,
  SerializedDiagnostic,
} from "./protocol";
