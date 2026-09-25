import { describe, expect, it, vi } from "vitest";

import { resolvePandaBuildInfoPath } from "./panda-config-paths";

describe("resolvePandaBuildInfoPath", () => {
  it.each([
    "@hashintel/ds-components/panda.buildinfo.json",
    "@hashintel/petrinaut/panda.buildinfo.json",
  ])("normalizes a Windows path for %s", (specifier) => {
    const resolve = vi.fn(() => `D:\\repo\\${specifier.replaceAll("/", "\\")}`);

    expect(resolvePandaBuildInfoPath(specifier, resolve, "win32")).toBe(
      `D:/repo/${specifier}`,
    );
    expect(resolve).toHaveBeenCalledWith(specifier);
  });

  it.each(["linux", "darwin"] as const)(
    "preserves a path on %s",
    (platform) => {
      const path = "/repo\\archive/panda.buildinfo.json";

      expect(
        resolvePandaBuildInfoPath("build-info", () => path, platform),
      ).toBe(path);
    },
  );
});
