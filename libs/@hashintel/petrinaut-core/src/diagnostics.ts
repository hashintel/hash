// Node/tooling-only headless diagnostics entry. The same TypeScript-backed
// checker the editor's language-server worker runs, callable without a
// browser so a host or test can ask whether a definition compiles cleanly.
// Kept separate from the main entry because it loads the TypeScript compiler.
import { DEFAULT_PETRINAUT_EXTENSIONS } from "./extensions";
import { checkSDCPN } from "./lsp/lib/checker";
import {
  createLanguageServers,
  disposeLanguageServers,
  syncLanguageServers,
} from "./lsp/lib/language-servers";

import type { PetrinautExtensionSettings } from "./extensions";
import type { SDCPN } from "./types/sdcpn";

export type {
  ItemType as SDCPNDiagnosticItemType,
  SDCPNCheckResult,
  SDCPNDiagnostic,
} from "./lsp/lib/checker";

/**
 * Type-check every code-bearing item of a definition, place visualizers
 * included, in fresh in-memory language services and return the grouped
 * result.
 */
export const checkDefinition = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
) => {
  const servers = createLanguageServers();
  try {
    syncLanguageServers(servers, sdcpn, extensions);
    return checkSDCPN(sdcpn, servers, extensions);
  } finally {
    disposeLanguageServers(servers);
  }
};
