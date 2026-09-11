/**
 * @layerRoot website.sharing
 * @role Encodes complete documents in share links and opens independent snapshots
 */
import {
  parseSDCPNFile,
  serializeSDCPN,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { maxSnapshotBytes, SnapshotError } from "./snapshot-codec";

export {
  maxSnapshotBytes,
  maxSnapshotHashLength,
  SnapshotError,
  snapshotErrorMessage,
  type SnapshotErrorCode,
} from "./snapshot-codec";

export type Snapshot = { title: string; definition: SDCPN };

export const serializeSnapshot = (snapshot: Snapshot): Uint8Array => {
  const document = JSON.parse(
    serializeSDCPN({
      petriNetDefinition: snapshot.definition,
      title: snapshot.title,
      format: "json",
    }),
  ) as unknown;
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  if (bytes.length > maxSnapshotBytes) throw new SnapshotError("too-large");
  return bytes;
};

export const parseSnapshot = (bytes: Uint8Array): Snapshot => {
  if (bytes.length > maxSnapshotBytes) throw new SnapshotError("too-large");
  try {
    const json: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    const parsed = parseSDCPNFile(json);
    if (!parsed.ok) throw new SnapshotError("invalid");
    const { title, ...definition } = parsed.sdcpn;
    return { title, definition };
  } catch (error) {
    throw error instanceof SnapshotError ? error : new SnapshotError("invalid");
  }
};
