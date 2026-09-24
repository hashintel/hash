import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  sdcpnInitialDataSchema,
} from "../src/flue";
import {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  canonicalPetrinautTools,
} from "../src/tools/petrinaut-construction";

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
    for (const mode of [STOCK_OVER_FLUE_MODE, INTEGRATED_BRUNCH_MODE])
      expect(v.parse(sdcpnInitialDataSchema, { mode, construction })).toEqual({
        mode,
        construction,
      });
    expect(
      v.safeParse(sdcpnInitialDataSchema, { mode: INTEGRATED_BRUNCH_MODE })
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
