import { describe, expect, it } from "vitest";

import {
  advanceTabAttention,
  advanceTabsAttention,
  type TabAttention,
} from "./tab-attention";

const fresh: TabAttention = { seen: undefined, count: 0 };

describe("advanceTabAttention", () => {
  it("counts nothing while the activity is unknown and takes the first collection as the baseline", () => {
    expect(advanceTabAttention(fresh, undefined, false)).toBe(fresh);
    const baseline = advanceTabAttention(fresh, ["a", "b"], false);
    expect(baseline.count).toBe(0);
    expect(baseline.seen).toEqual(new Set(["a", "b"]));
  });

  it("counts identities that appear after the baseline until the tab is shown", () => {
    const baseline = advanceTabAttention(fresh, ["a"], false);
    const one = advanceTabAttention(baseline, ["a", "b"], false);
    expect(one.count).toBe(1);
    const two = advanceTabAttention(one, ["a", "b", "c"], false);
    expect(two.count).toBe(2);
    const shown = advanceTabAttention(two, ["a", "b", "c"], true);
    expect(shown.count).toBe(0);
    expect(shown.seen).toEqual(two.seen);
  });

  it("marks identities seen while the tab is shown without counting them", () => {
    const baseline = advanceTabAttention(fresh, ["a"], true);
    const whileShown = advanceTabAttention(baseline, ["a", "b"], true);
    expect(whileShown.count).toBe(0);
    const later = advanceTabAttention(whileShown, ["a", "b"], false);
    expect(later).toBe(whileShown);
  });

  it("returns the same state when nothing changed", () => {
    const baseline = advanceTabAttention(fresh, ["a"], false);
    expect(advanceTabAttention(baseline, ["a"], false)).toBe(baseline);
    expect(advanceTabAttention(baseline, undefined, false)).toBe(baseline);
  });
});

describe("advanceTabsAttention", () => {
  const ledger = (activityIdentities?: readonly string[]) => ({
    id: "ledger",
    label: "Ledger",
    activityIdentities,
  });

  it("announces a tab whose unseen count grew and keeps the state when nothing changed", () => {
    const first = advanceTabsAttention({}, [ledger(["a"])], null);
    expect(first.announcement).toBeNull();
    const grown = advanceTabsAttention(
      first.attention,
      [ledger(["a", "b"])],
      null,
    );
    expect(grown.announcement).toBe("1 unseen Ledger update");
    expect(grown.attention.ledger?.count).toBe(1);
    const same = advanceTabsAttention(
      grown.attention,
      [ledger(["a", "b"])],
      null,
    );
    expect(same.attention).toBe(grown.attention);
    expect(same.announcement).toBeNull();
    const more = advanceTabsAttention(
      same.attention,
      [ledger(["a", "b", "c", "d"])],
      null,
    );
    expect(more.announcement).toBe("3 unseen Ledger updates");
  });

  it("resets the shown tab and drops tabs no longer listed", () => {
    const grown = advanceTabsAttention(
      advanceTabsAttention({}, [ledger(["a"])], null).attention,
      [ledger(["a", "b"])],
      null,
    );
    const shown = advanceTabsAttention(
      grown.attention,
      [ledger(["a", "b"])],
      "ledger",
    );
    expect(shown.attention.ledger?.count).toBe(0);
    const withdrawn = advanceTabsAttention(shown.attention, [], null);
    expect(withdrawn.attention).toEqual({});
  });
});
