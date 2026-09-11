import { checkSDCPN } from "./checker";
import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { filePathToUri } from "./document-uris";
import { serializeDiagnostic } from "./ts-to-lsp";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";
import type { PublishDiagnosticsParams } from "../worker/protocol";

export const checkSnapshot = (
  sdcpn: SDCPN,
  extensions?: PetrinautExtensionSettings,
): PublishDiagnosticsParams[] => {
  const snapshotServer = new SDCPNLanguageServer();
  try {
    snapshotServer.syncFiles(sdcpn, extensions);
    return checkSDCPN(sdcpn, snapshotServer, extensions).itemDiagnostics.map(
      (item) => ({
        uri: filePathToUri(item.filePath) ?? item.filePath,
        diagnostics: item.diagnostics.map((diagnostic) =>
          serializeDiagnostic(
            diagnostic,
            snapshotServer.getUserContent(item.filePath) ?? "",
          ),
        ),
      }),
    );
  } finally {
    snapshotServer.dispose();
  }
};
