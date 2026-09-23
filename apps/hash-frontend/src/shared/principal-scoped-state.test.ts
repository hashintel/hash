import { describe, expect, it, vi } from "vitest";

import { createPrincipalTracker } from "./principal-scoped-state";

describe("a principal tracker", () => {
  it("does not treat the first principal it sees as a transition", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn();
    tracker.register(reset);

    expect(tracker.enter("actor-a")).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets when the principal changes to another one", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn();
    tracker.register(reset);
    tracker.enter("actor-a");

    expect(tracker.enter("actor-b")).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("resets when the principal signs out", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn();
    tracker.register(reset);
    tracker.enter("actor-a");

    // `undefined` is the public user, which is a principal like any other: rows
    // A could read are not rows the public user may keep looking at.
    expect(tracker.enter(undefined)).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("resets when a public session signs in", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn();
    tracker.register(reset);
    tracker.enter(undefined);

    expect(tracker.enter("actor-a")).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("resets nothing when the same principal is re-observed", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn();
    tracker.register(reset);
    tracker.enter("actor-a");

    // The app refetches the authenticated user on every navigation, so this is
    // the common case by a wide margin: it must preserve every cache.
    expect(tracker.enter("actor-a")).toBe(false);
    expect(tracker.enter("actor-a")).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it("runs every registered reset", () => {
    const tracker = createPrincipalTracker();
    const first = vi.fn();
    const second = vi.fn();
    tracker.register(first);
    tracker.register(second);
    tracker.enter("actor-a");

    tracker.enter("actor-b");

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops running an unregistered reset", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn();
    const unregister = tracker.register(reset);
    tracker.enter("actor-a");

    unregister();

    expect(tracker.enter("actor-b")).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it("runs the remaining resets when one unregisters itself while running", () => {
    const tracker = createPrincipalTracker();
    const second = vi.fn();
    const unregisterFirst = tracker.register(() => {
      unregisterFirst();
    });
    tracker.register(second);
    tracker.enter("actor-a");

    tracker.enter("actor-b");

    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not run a reset that another reset registered mid-transition", () => {
    const tracker = createPrincipalTracker();
    const late = vi.fn();
    tracker.register(() => {
      tracker.register(late);
    });
    tracker.enter("actor-a");

    tracker.enter("actor-b");

    // It guards the state of a principal this transition already left behind, so
    // running it here would be meaningless; and each such registration would
    // extend the pass that is running, which is how the loop stops terminating.
    expect(late).not.toHaveBeenCalled();
  });

  it("has run every reset before it returns", () => {
    const tracker = createPrincipalTracker();
    // The whole point of the placement contract: by the time the caller's next
    // statement runs — publishing the new principal to its consumers — the
    // previous principal's state is already gone. A reset scheduled in a
    // microtask, or in an effect, would leave one window open.
    const calls: string[] = [];
    tracker.register(() => calls.push("reset"));
    tracker.enter("actor-a");

    tracker.enter("actor-b");
    calls.push("returned");

    expect(calls).toEqual(["reset", "returned"]);
  });

  it("absorbs a re-entrant observation of the principal being entered", () => {
    const tracker = createPrincipalTracker();
    const reset = vi.fn(() => {
      // A reset notifies its subscribers synchronously; a subscriber that
      // re-renders arrives back here with the principal already current.
      expect(tracker.enter("actor-b")).toBe(false);
    });
    tracker.register(reset);
    tracker.enter("actor-a");

    tracker.enter("actor-b");

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
