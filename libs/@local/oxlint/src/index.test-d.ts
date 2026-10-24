import { describe, expectTypeOf, test } from "vitest";

import type { Options } from "@local/oxlint";
import type { OxlintConfig } from "oxlint";

describe("options", () => {
  test("native_fields", () => {
    expectTypeOf<
      Omit<Options, "runtime" | "frameworks" | "additionalRestrictedTypes">
    >().toEqualTypeOf<OxlintConfig>();
  });

  test("required_runtime", () => {
    expectTypeOf<Options["runtime"]>().toEqualTypeOf<"node" | "browser">();
  });
});
