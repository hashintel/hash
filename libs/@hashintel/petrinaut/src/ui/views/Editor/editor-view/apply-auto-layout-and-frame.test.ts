import { expect, it, vi } from "vitest";

import { applyAutoLayoutAndFrame } from "./apply-auto-layout-and-frame";

it("awaits layout then one frame even when layout commits nothing", async () => {
  const order: string[] = [];
  const applyAutoLayout = vi.fn(async () => {
    order.push("layout");
    return { commitCount: 0 };
  });
  const frameSceneAfterRender = vi.fn(async () => {
    order.push("frame");
    return "empty" as const;
  });

  await expect(
    applyAutoLayoutAndFrame({ applyAutoLayout, frameSceneAfterRender }),
  ).resolves.toEqual({ commitCount: 0, frameStatus: "empty" });
  expect(order).toEqual(["layout", "frame"]);
  expect(frameSceneAfterRender).toHaveBeenCalledOnce();
});

it("reports an unavailable renderer without changing the layout result", async () => {
  await expect(
    applyAutoLayoutAndFrame({
      applyAutoLayout: async () => ({ commitCount: 4 }),
      frameSceneAfterRender: async () => "no-renderer",
    }),
  ).resolves.toEqual({ commitCount: 4, frameStatus: "no-renderer" });
});
