import { readFile } from "node:fs/promises";

import { parseSDCPNDocument, parseSDCPNFile } from "@hashintel/petrinaut-core";

import type { ImportResult, SDCPN } from "@hashintel/petrinaut-core";

function unwrapImportResult(parsed: ImportResult): SDCPN {
  if (parsed.ok) {
    return parsed.sdcpn;
  }

  throw new Error(parsed.error);
}

export function parseSdcpnModel(data: unknown): SDCPN {
  return unwrapImportResult(parseSDCPNFile(data));
}

export async function loadSdcpnModel(path: string): Promise<SDCPN> {
  return unwrapImportResult(parseSDCPNDocument(await readFile(path, "utf8")));
}
