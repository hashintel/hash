import { describe, expect, test, vi } from "vitest";

import { BrunchPanelConversationTracker } from "../brunch-panel-transport";
import { requestFlueStop } from "./request-flue-stop";

import type { FlueClient } from "@flue/sdk";

describe("requestFlueStop", () => {
  test.each([
    [true, "stop-requested"],
    [false, "already-settled"],
  ] as const)(
    "maps Flue abort result %s onto the host Stop contract",
    async (aborted, expected) => {
      const abort = vi.fn<FlueClient["abort"]>(async () => ({ aborted }));
      const client = { abort } as Pick<FlueClient, "abort"> as FlueClient;

      await expect(
        requestFlueStop(
          Promise.resolve(client),
          new BrunchPanelConversationTracker(),
        ),
      ).resolves.toBe(expected);
      expect(abort).toHaveBeenCalledOnce();
    },
  );

  test("lets an in-flight admission land before requesting the durable abort", async () => {
    const abort = vi.fn<FlueClient["abort"]>(async () => ({ aborted: true }));
    const client = { abort } as Pick<FlueClient, "abort"> as FlueClient;
    const tracker = new BrunchPanelConversationTracker();
    const stopListener = vi.fn();
    tracker.subscribeToStopRequested(stopListener);
    let admit: (() => void) | undefined;
    void tracker.trackSubmission(
      new Promise<void>((resolve) => {
        admit = resolve;
      }),
    );

    const stop = requestFlueStop(Promise.resolve(client), tracker);
    expect(stopListener).toHaveBeenCalledOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(abort).not.toHaveBeenCalled();

    admit?.();
    await expect(stop).resolves.toBe("stop-requested");
    expect(abort).toHaveBeenCalledOnce();
  });
});
