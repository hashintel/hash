import {
  compareOntologyTypeVersions,
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system";

import type { VersionedUrl } from "@blockprotocol/type-system";

type DataTypeRow = {
  rowId: string;
  typeId: VersionedUrl;
  parentIds: readonly VersionedUrl[];
};

export type DataTypeTreePosition = {
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  matchesSearch: boolean;
};

const valueBaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/data-type/value/";

/** Input order determines the order of roots and siblings, without separating children from parents. */
export const buildDataTypeTree = <Row extends DataTypeRow>({
  rows,
  expandedRows,
  matchingIds,
  collapsedSearchRows,
}: {
  rows: readonly Row[];
  expandedRows: ReadonlySet<string>;
  /** Undefined means browsing; an empty set means a search with no matches. */
  matchingIds?: ReadonlySet<VersionedUrl>;
  collapsedSearchRows: ReadonlySet<string>;
}): (Row & { hierarchy: DataTypeTreePosition })[] => {
  const byId = new Map(rows.map((row) => [row.typeId, row]));
  const latestByBaseUrl = new Map<string, Row>();
  for (const row of rows) {
    const baseUrl = extractBaseUrl(row.typeId);
    const previous = latestByBaseUrl.get(baseUrl);
    if (
      !previous ||
      compareOntologyTypeVersions(
        extractVersion(previous.typeId),
        extractVersion(row.typeId),
      ) < 0
    ) {
      latestByBaseUrl.set(baseUrl, row);
    }
  }

  const parents = new Map<VersionedUrl, Set<VersionedUrl>>();
  const children = new Map<VersionedUrl, VersionedUrl[]>();
  for (const row of rows) {
    const parentIds = new Set<VersionedUrl>();
    for (const reference of row.parentIds) {
      const parent =
        byId.get(reference) ?? latestByBaseUrl.get(extractBaseUrl(reference));
      if (parent && parent.typeId !== row.typeId) {
        parentIds.add(parent.typeId);
      }
    }
    parents.set(row.typeId, parentIds);
    for (const parentId of parentIds) {
      const siblings = children.get(parentId) ?? [];
      siblings.push(row.typeId);
      children.set(parentId, siblings);
    }
  }

  // Value contains every representation. Start one level below it unless it is a search result or stands alone.
  const value = latestByBaseUrl.get(valueBaseUrl);
  const hiddenValueId =
    value &&
    children.get(value.typeId)?.length &&
    !matchingIds?.has(value.typeId)
      ? value.typeId
      : undefined;

  const includedIds = matchingIds ? new Set(matchingIds) : undefined;
  if (includedIds) {
    const pending = [...includedIds];
    while (pending.length) {
      const id = pending.pop()!;
      for (const parentId of parents.get(id) ?? []) {
        if (!includedIds.has(parentId)) {
          includedIds.add(parentId);
          pending.push(parentId);
        }
      }
    }
  }

  const roots = rows.filter(
    (row) =>
      row.typeId !== hiddenValueId &&
      [...(parents.get(row.typeId) ?? [])].every((id) => id === hiddenValueId),
  );

  // Keep malformed cyclic components reachable, even when they have no root.
  const reachable = new Set<VersionedUrl>();
  const markReachable = (id: VersionedUrl) => {
    if (reachable.has(id)) {
      return;
    }
    reachable.add(id);
    for (const childId of children.get(id) ?? []) {
      markReachable(childId);
    }
  };
  for (const root of roots) {
    markReachable(root.typeId);
  }
  for (const row of rows) {
    if (row.typeId !== hiddenValueId && !reachable.has(row.typeId)) {
      roots.push(row);
      markReachable(row.typeId);
    }
  }

  const result: (Row & { hierarchy: DataTypeTreePosition })[] = [];
  const visit = (row: Row, path: VersionedUrl[]) => {
    if (
      path.includes(row.typeId) ||
      (includedIds && !includedIds.has(row.typeId))
    ) {
      return;
    }
    const nextPath = [...path, row.typeId];
    // A type can inherit from several parents: each occurrence needs its own expansion and selection identity.
    const rowId = JSON.stringify(nextPath);
    const childIds = (children.get(row.typeId) ?? []).filter(
      (id) => !nextPath.includes(id) && (!includedIds || includedIds.has(id)),
    );
    const hasChildren = childIds.length > 0;
    const expanded =
      hasChildren &&
      (matchingIds ? !collapsedSearchRows.has(rowId) : expandedRows.has(rowId));
    result.push({
      ...row,
      rowId,
      hierarchy: {
        depth: path.length,
        expanded,
        hasChildren,
        matchesSearch: !matchingIds || matchingIds.has(row.typeId),
      },
    });
    if (expanded) {
      for (const childId of childIds) {
        visit(byId.get(childId)!, nextPath);
      }
    }
  };
  for (const root of roots) {
    visit(root, []);
  }
  return result;
};
