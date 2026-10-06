import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { CANONICAL_PETRINAUT_TOOL_NAMES } from "../src/construction-tool-names";
import { sdcpnInitialDataSchema } from "../src/initial-data";
import { asyncCanonicalPetrinautTools } from "../src/tools/petrinaut-construction";

const bound = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
  },
};

describe("Petrinaut catalogue", () => {
  test("admits no initial data or initial data carrying a document binding", () => {
    expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
    expect(v.parse(sdcpnInitialDataSchema, bound)).toEqual(bound);
    expect(v.safeParse(sdcpnInitialDataSchema, {}).success).toBe(false);
  });
  test("mounts the complete async canonical catalogue for a bound conversation", () => {
    expect(CANONICAL_PETRINAUT_TOOL_NAMES).toEqual(
      Object.keys(petrinautAiTools),
    );
    expect(
      asyncCanonicalPetrinautTools(async () => ({ output: null })).map(
        (tool) => tool.name,
      ),
    ).toEqual(Object.keys(petrinautAiTools));
  });
});
