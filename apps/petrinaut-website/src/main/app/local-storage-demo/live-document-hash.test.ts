import { expect, test } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { readLiveDocumentHash } from "./live-document-hash";

test("hashes the live document with the Ledger reconciliation identity", () => {
  const handle = createJsonDocHandle({
    id: "document",
    initial: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  });

  expect(readLiveDocumentHash(handle)).toBe(
    "28b3d59d5d58920b2cf90253ff84e4454f33469dd8cc2964f931d3d3e7707ced",
  );
});
