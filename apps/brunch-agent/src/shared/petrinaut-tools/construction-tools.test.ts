import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  vSdcpnInitialData,
} from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { asyncCanonicalPetrinautTools } from "./petrinaut-construction.ts";

const bound = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
  },
};

describe("Petrinaut catalogue", () => {
  test("admits no initial data or initial data carrying a document binding", () => {
    expect(v.parse(vSdcpnInitialData, undefined)).toBeUndefined();
    expect(v.parse(vSdcpnInitialData, bound)).toEqual(bound);
    const withIncarnation = {
      binding: { ...bound.binding, incarnationId: "document" },
    };
    expect(v.parse(vSdcpnInitialData, withIncarnation)).toEqual(
      withIncarnation,
    );
    expect(v.safeParse(vSdcpnInitialData, {}).success).toBe(false);
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
