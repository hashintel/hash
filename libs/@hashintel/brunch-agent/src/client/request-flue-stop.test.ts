import { describe, expect, test, vi } from "vitest";

import { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import {
  requestFlueStop,
  requestFlueStopIfStillWanted,
} from "./request-flue-stop";

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

  test("a stop withdrawn once the in-flight admission lands neither announces nor aborts", async () => {
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
    let wanted = true;

    const stop = requestFlueStopIfStillWanted(
      Promise.resolve(client),
      tracker,
      () => wanted,
    );
    // A message sent meanwhile withdraws the stop: the turn keeps running.
    wanted = false;
    admit?.();

    await expect(stop).resolves.toBe("withdrawn");
    expect(abort).not.toHaveBeenCalled();
    expect(stopListener).not.toHaveBeenCalled();
  });

  test.each([
    [true, "stop-requested"],
    [false, "already-settled"],
  ] as const)(
    "a stop still wanted once the in-flight admission lands announces itself, then aborts (%s)",
    async (aborted, expected) => {
      const abort = vi.fn<FlueClient["abort"]>(async () => ({ aborted }));
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

      const stop = requestFlueStopIfStillWanted(
        Promise.resolve(client),
        tracker,
        () => true,
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(stopListener).not.toHaveBeenCalled();

      admit?.();
      await expect(stop).resolves.toBe(expected);
      expect(stopListener).toHaveBeenCalledOnce();
      expect(abort).toHaveBeenCalledOnce();
    },
  );
});
