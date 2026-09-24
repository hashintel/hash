import { describe, expect, it, vi } from "vitest";

import { loadOnce } from "./load-once";

describe("loadOnce", () => {
  it("shares one import between calls", async () => {
    const load = vi.fn(async () => "module");
    const loadModule = loadOnce(load);

    expect(loadModule()).toBe(loadModule());
    await expect(loadModule()).resolves.toBe("module");
    expect(load).toHaveBeenCalledOnce();
  });

  it("imports again after a rejected import", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValueOnce("module");
    const loadModule = loadOnce(load);

    await expect(loadModule()).rejects.toThrow("chunk failed");
    await expect(loadModule()).resolves.toBe("module");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
