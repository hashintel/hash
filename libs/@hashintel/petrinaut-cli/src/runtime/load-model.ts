import { readFile } from "node:fs/promises";

import { parseSDCPNDocument, parseSDCPNFile } from "@hashintel/petrinaut-core";

import type { SDCPN } from "@hashintel/petrinaut-core";

export function parseSdcpnModel(data: unknown): SDCPN {
  const parsed = parseSDCPNFile(data);
  if (parsed.ok) {
    return parsed.sdcpn;
  }

  throw new Error(parsed.error);
}

export async function loadSdcpnModel(path: string): Promise<SDCPN> {
  const text = await readFile(path, "utf8");
  const parsed = parseSDCPNDocument(text);
  if (parsed.ok) {
    return parsed.sdcpn;
  }

  throw new Error(parsed.error);
}
