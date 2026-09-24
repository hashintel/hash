import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { brunchModes } from "@hashintel/brunch-agent/constants";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { CANONICAL_PETRINAUT_TOOL_NAMES } from "../src/construction-tool-names";
import { sdcpnInitialDataSchema } from "../src/initial-data";
import { canonicalPetrinautTools } from "../src/tools/petrinaut-construction";

const construction = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
    incarnationId: "incarnation",
  },
};

describe("Petrinaut catalogue", () => {
  test("retains the optional no-mode conversation and binds F/I to a document", () => {
    expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
    for (const mode of [brunchModes.stockOverFlue, brunchModes.integrated])
      expect(v.parse(sdcpnInitialDataSchema, { mode, construction })).toEqual({
        mode,
        construction,
      });
    expect(
      v.safeParse(sdcpnInitialDataSchema, { mode: brunchModes.integrated })
        .success,
    ).toBe(false);
  });
  test("mounts the complete canonical catalogue in F", () => {
    expect(CANONICAL_PETRINAUT_TOOL_NAMES).toEqual(
      Object.keys(petrinautAiTools),
    );
    expect(canonicalPetrinautTools.map((tool) => tool.name)).toEqual(
      Object.keys(petrinautAiTools),
    );
  });
});
