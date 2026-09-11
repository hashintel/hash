// Node/tooling-only headless diagnostics entry. The same TypeScript-backed
// checker the editor's language-server worker runs, callable without a
// browser so a host or test can ask whether a definition compiles cleanly.
// Kept separate from the main entry because it bundles the TypeScript
// compiler.
import { DEFAULT_PETRINAUT_EXTENSIONS } from "./extensions";
import { checkSDCPN } from "./lsp/lib/checker";
import { SDCPNLanguageServer } from "./lsp/lib/create-sdcpn-language-service";

import type { PetrinautExtensionSettings } from "./extensions";
import type { SDCPN } from "./types/sdcpn";

export { checkSDCPN, SDCPNLanguageServer };
export type {
  ItemType as SDCPNDiagnosticItemType,
  SDCPNCheckResult,
  SDCPNDiagnostic,
} from "./lsp/lib/checker";

/**
 * Type-check every code-bearing item of a definition in a fresh in-memory
 * language service and return the grouped result.
 */
export const checkDefinition = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
) => {
  const server = new SDCPNLanguageServer();
  server.syncFiles(sdcpn, extensions);
  return checkSDCPN(sdcpn, server, extensions);
};
