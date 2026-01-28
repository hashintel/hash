/**
 * React Context for the LSP Client.
 */

import { createContext } from "react";

import type { LSPClient } from "./lsp-client";

export interface LSPContextValue {
  /**
   * The LSP client instance for communicating with the worker.
   * May be null during initial render before the client is created.
   */
  client: LSPClient | null;

  /**
   * Whether the LSP is initialized and ready for requests.
   */
  isReady: boolean;
}

const DEFAULT_CONTEXT_VALUE: LSPContextValue = {
  client: null,
  isReady: false,
};

export const LSPContext = createContext<LSPContextValue>(DEFAULT_CONTEXT_VALUE);
