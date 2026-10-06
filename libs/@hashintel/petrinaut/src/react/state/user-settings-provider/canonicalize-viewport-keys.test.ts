import { describe, expect, it } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { canonicalizeViewportKeys } from "./canonicalize-viewport-keys";

const saved = (zoom: number, savedAt?: number) => ({
  x: 0,
  y: 0,
  zoom,
  ...(savedAt === undefined ? {} : { savedAt }),
});

describe("canonicalizeViewportKeys", () => {
  it("keys every viewport by its net id", () => {
    const netId = toPetrinautId("net-1");
    expect(
      canonicalizeViewportKeys({ "net-1": saved(1, 10), [netId]: saved(2) }),
    ).toEqual({ [netId]: saved(1, 10) });
  });

  it("keeps the later save when two keys name the same net", () => {
    const netId = toPetrinautId("net-1");
    expect(
      canonicalizeViewportKeys({
        "net-1": saved(1, 10),
        [netId]: saved(2, 20),
      }),
    ).toEqual({ [netId]: saved(2, 20) });
  });

  it("keeps canonical keys as they are", () => {
    const viewports = {
      [toPetrinautId("a")]: saved(1, 10),
      [toPetrinautId("b")]: saved(2),
    };
    expect(canonicalizeViewportKeys(viewports)).toEqual(viewports);
  });
});
