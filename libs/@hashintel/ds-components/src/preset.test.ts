import { describe, expect, it, vi } from "vitest";

import { resolvePandaBuildInfoPath } from "./preset";

describe("resolvePandaBuildInfoPath", () => {
  it("resolves the specifier with the consumer's resolver", () => {
    const resolve = vi.fn((specifier: string) => `/repo/${specifier}`);

    expect(
      resolvePandaBuildInfoPath("pkg/panda.buildinfo.json", resolve, "linux"),
    ).toBe("/repo/pkg/panda.buildinfo.json");
    expect(resolve).toHaveBeenCalledWith("pkg/panda.buildinfo.json");
  });

  it.each([
    [
      "D:\\repo\\node_modules\\pkg\\dist\\panda.buildinfo.json",
      "D:/repo/node_modules/pkg/dist/panda.buildinfo.json",
    ],
    [
      "\\\\server\\share\\repo\\pkg\\dist\\panda.buildinfo.json",
      "//server/share/repo/pkg/dist/panda.buildinfo.json",
    ],
  ])("uses forward slashes for the Windows path %s", (path, expected) => {
    expect(
      resolvePandaBuildInfoPath(
        "pkg/panda.buildinfo.json",
        () => path,
        "win32",
      ),
    ).toBe(expected);
  });

  it.each(["linux", "darwin"])("preserves the path on %s", (platform) => {
    const path = "/repo\\archive/pkg/dist/panda.buildinfo.json";

    expect(
      resolvePandaBuildInfoPath(
        "pkg/panda.buildinfo.json",
        () => path,
        platform,
      ),
    ).toBe(path);
  });
});
