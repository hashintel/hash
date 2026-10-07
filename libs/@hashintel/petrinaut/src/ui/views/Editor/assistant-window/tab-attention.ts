/**
 * Unseen updates per assistant tab, from the activity identities each tab
 * reports. The first collection a tab reports is its baseline; identities
 * that appear later count as unseen until the tab is shown, and the count
 * resets while it is. Pure, so the window advances it during render.
 */

export interface TabAttention {
  /** Every identity seen so far, as `type:value`; `undefined` before the baseline. */
  readonly seen: ReadonlySet<string> | undefined;
  readonly count: number;
}

export type TabsAttention = Readonly<Record<string, TabAttention>>;

const noAttention: TabAttention = { seen: undefined, count: 0 };

const identityKey = (identity: number | string) =>
  `${typeof identity}:${String(identity)}`;

/**
 * The next attention state of one tab. Returns the same object when nothing
 * changed, so callers can compare by identity.
 */
export const advanceTabAttention = (
  previous: TabAttention,
  activityIdentities: readonly (number | string)[] | undefined,
  viewing: boolean,
): TabAttention => {
  const count = viewing ? 0 : previous.count;
  if (activityIdentities === undefined) {
    return count === previous.count ? previous : { ...previous, count };
  }
  const current = new Set(activityIdentities.map(identityKey));
  const { seen } = previous;
  if (seen === undefined) {
    return { seen: current, count };
  }
  const additions = [...current].filter((identity) => !seen.has(identity));
  if (additions.length === 0) {
    return count === previous.count ? previous : { ...previous, count };
  }

  return {
    seen: new Set([...seen, ...additions]),
    count: viewing ? 0 : count + additions.length,
  };
};

/**
 * Advances every listed tab and drops the ones no longer listed. Returns the
 * same object when no tab changed, plus the announcement for any tab whose
 * unseen count grew.
 */
export const advanceTabsAttention = (
  previous: TabsAttention,
  tabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly activityIdentities?: readonly (number | string)[];
  }[],
  viewingTabId: string | null,
): { attention: TabsAttention; announcement: string | null } => {
  let changed = Object.keys(previous).length !== tabs.length;
  let announcement: string | null = null;
  const attention: Record<string, TabAttention> = {};
  for (const tab of tabs) {
    const before = previous[tab.id] ?? noAttention;
    const after = advanceTabAttention(
      before,
      tab.activityIdentities,
      viewingTabId === tab.id,
    );
    attention[tab.id] = after;
    if (after !== before) changed = true;
    if (after.count > before.count) {
      announcement = `${after.count} unseen ${tab.label} update${after.count === 1 ? "" : "s"}`;
    }
  }

  return { attention: changed ? attention : previous, announcement };
};
