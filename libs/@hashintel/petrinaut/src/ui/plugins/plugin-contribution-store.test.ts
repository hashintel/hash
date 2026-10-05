import { describe, expect, it, vi } from "vitest";

import {
  createPluginContributionStore,
  type PetrinautPluginContribution,
} from "./plugin-contribution-store";

const contribution = (
  id: string,
  providers: PetrinautPluginContribution["providers"] = {},
): PetrinautPluginContribution => ({
  manifest: { id, name: id },
  providers,
  settings: { values: {}, set: () => {} },
});

describe("createPluginContributionStore", () => {
  it("notifies on a new or changed contribution and keeps the snapshot otherwise", () => {
    const store = createPluginContributionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const first = contribution("a");

    store.publish(first);
    const snapshot = store.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot.get("a")).toBe(first);

    store.publish(first);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(snapshot);

    store.publish({ ...first, providers: {} });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).not.toBe(snapshot);
  });

  it("forgets a withdrawn plugin once and leaves the others", () => {
    const store = createPluginContributionStore();
    const listener = vi.fn();
    store.publish(contribution("a"));
    store.publish(contribution("b"));
    store.subscribe(listener);

    store.withdraw("a");
    store.withdraw("a");
    expect(listener).toHaveBeenCalledTimes(1);
    expect([...store.getSnapshot().keys()]).toEqual(["b"]);
  });

  it("stops notifying an unsubscribed listener", () => {
    const store = createPluginContributionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.publish(contribution("a"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("records the hosts' first commit once", () => {
    const store = createPluginContributionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.hasCommitted()).toBe(false);

    store.markCommitted();
    store.markCommitted();
    expect(store.hasCommitted()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
