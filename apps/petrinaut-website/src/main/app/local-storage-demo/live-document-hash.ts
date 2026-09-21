import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";

/** Hash the live document with the same JSON/SHA-256 identity used by Ledger reconciliation. */
export const readLiveDocumentHash = (handle: PetrinautDocHandle): string => {
  const definition = handle.doc();
  if (!definition)
    throw new Error("The bound browser document is unavailable.");
  return bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(definition))),
  );
};
