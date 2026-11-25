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
  continuationDepths: number[];
  hasNextSibling: boolean;
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
  toggledSearchRows,
}: {
  rows: readonly Row[];
  expandedRows: ReadonlySet<string>;
  /** Undefined means browsing; an empty set means a search with no matches. */
  matchingIds?: ReadonlySet<VersionedUrl>;
  /** Rows the user has expanded or collapsed during a search, inverting their default. */
  toggledSearchRows: ReadonlySet<string>;
}): {
  rows: (Row & { hierarchy: DataTypeTreePosition })[];
  isFlat: boolean;
} => {
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

  // A search shows its matches, their ancestors and their descendants.
  // Only rows that lead to a match start expanded.
  const ancestorIds = new Set<VersionedUrl>();
  const includedIds = matchingIds ? new Set(matchingIds) : undefined;
  if (matchingIds && includedIds) {
    const pendingAncestors = [...matchingIds];
    while (pendingAncestors.length) {
      const id = pendingAncestors.pop()!;
      for (const parentId of parents.get(id) ?? []) {
        if (!ancestorIds.has(parentId)) {
          ancestorIds.add(parentId);
          includedIds.add(parentId);
          pendingAncestors.push(parentId);
        }
      }
    }
    const descendantIds = new Set(matchingIds);
    const pendingDescendants = [...matchingIds];
    while (pendingDescendants.length) {
      const id = pendingDescendants.pop()!;
      for (const childId of children.get(id) ?? []) {
        if (!descendantIds.has(childId)) {
          descendantIds.add(childId);
          includedIds.add(childId);
          pendingDescendants.push(childId);
        }
      }
    }
  }

  const roots = rows.filter(
    (row) =>
      row.typeId !== hiddenValueId &&
      (!parents.get(row.typeId)?.size ||
        (hiddenValueId !== undefined &&
          parents.get(row.typeId)?.has(hiddenValueId))),
  );

  // Keep malformed cyclic components reachable, even when they have no root.
  const reachable = new Set<VersionedUrl>();
  const markReachable = (id: VersionedUrl) => {
    const pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (!reachable.has(current)) {
        reachable.add(current);
        for (const childId of children.get(current) ?? []) {
          pending.push(childId);
        }
      }
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
  // Shared ancestry can multiply paths exponentially. Bound path copying and
  // edge traversal, then fall back to a complete, flat list of matching types.
  const traversalBudget = Math.max(10_000, rows.length * 4);
  let traversalWork = 0;
  const visit = (
    row: Row,
    path: VersionedUrl[],
    continuationDepths: number[],
    hasNextSibling: boolean,
  ): boolean => {
    if (
      path.includes(row.typeId) ||
      (includedIds && !includedIds.has(row.typeId))
    ) {
      return true;
    }
    const descendants = children.get(row.typeId) ?? [];
    traversalWork += (path.length + 1) * (descendants.length + 1);
    if (traversalWork > traversalBudget || path.length >= 256) {
      return false;
    }
    const nextPath = [...path, row.typeId];
    // A type can inherit from several parents: each occurrence needs its own expansion and selection identity.
    const rowId = JSON.stringify(nextPath);
    const childIds = descendants.filter(
      (id) => !nextPath.includes(id) && (!includedIds || includedIds.has(id)),
    );
    const hasChildren = childIds.length > 0;
    const expanded =
      hasChildren &&
      (matchingIds
        ? ancestorIds.has(row.typeId) !== toggledSearchRows.has(rowId)
        : expandedRows.has(rowId));
    result.push({
      ...row,
      rowId,
      hierarchy: {
        depth: path.length,
        continuationDepths,
        hasNextSibling,
        expanded,
        hasChildren,
        matchesSearch: !matchingIds || matchingIds.has(row.typeId),
      },
    });
    if (expanded) {
      const childContinuationDepths =
        path.length > 0 && hasNextSibling
          ? [...continuationDepths, path.length - 1]
          : continuationDepths;
      for (const [index, childId] of childIds.entries()) {
        if (
          !visit(
            byId.get(childId)!,
            nextPath,
            childContinuationDepths,
            index < childIds.length - 1,
          )
        ) {
          return false;
        }
      }
    }
    return true;
  };
  for (const root of roots) {
    if (!visit(root, [], [], false)) {
      return {
        isFlat: true,
        rows: rows
          .filter((row) => !matchingIds || matchingIds.has(row.typeId))
          .map((row) => ({
            ...row,
            rowId: JSON.stringify([row.typeId]),
            hierarchy: {
              depth: 0,
              continuationDepths: [],
              hasNextSibling: false,
              expanded: false,
              hasChildren: false,
              matchesSearch: true,
            },
          })),
      };
    }
  }
  return { rows: result, isFlat: false };
};
