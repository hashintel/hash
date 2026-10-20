import { describe, expect, test } from "vitest";

import { defineConfig } from "./index.js";

describe("defineConfig", () => {
  test("reserved_type", () => {
    expect.hasAssertions();

    const additionalRestrictedTypes: Record<string, string> = {
      unknown: "Override",
    };

    expect(() =>
      defineConfig({ additionalRestrictedTypes, runtime: "node" }),
    ).toThrow('"unknown"');
  });
});
