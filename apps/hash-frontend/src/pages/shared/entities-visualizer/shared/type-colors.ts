import { brandmarkScale } from "@hashintel/ds-components";

import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * Per-type node colouring for the network graph view: the selectable palette,
 * the default assignment (the {@link MAX_TYPE_COLORS} most common types by
 * entity count — see {@link typeColorRanks}), and the light grey used for
 * everything else.
 */

/** The most distinct colours offered, and the number auto-assigned by default. */
export const MAX_TYPE_COLORS = 20;

/** The selectable palette — the first {@link MAX_TYPE_COLORS} Brandmark colours. */
export const typeColorPalette = brandmarkScale(MAX_TYPE_COLORS);

/** Shown for any type without a colour of its own (design-system `gray[40]`). */
export const unassignedTypeColor = "#C1CFDE";

export type TypeColorOverrides = Map<VersionedUrl, string>;

/**
 * Ranks types for the default colouring: the types with the most entities rank
 * first (rank `0` upward), so the {@link MAX_TYPE_COLORS} most common types take
 * the distinct palette colours and the long tail falls through to grey. Ties
 * break by title, keeping the assignment stable and deterministic. Pass the
 * resulting rank as {@link resolveTypeColor}'s `index`.
 */
export const typeColorRanks = (
  types: readonly {
    entityTypeId: VersionedUrl;
    count: number;
    title: string;
  }[],
): Map<VersionedUrl, number> => {
  const ranked = [...types].sort(
    (first, second) =>
      second.count - first.count || first.title.localeCompare(second.title),
  );
  const ranks = new Map<VersionedUrl, number>();
  for (const [rank, type] of ranked.entries()) {
    ranks.set(type.entityTypeId, rank);
  }
  return ranks;
};

/**
 * The colour for a type: the user's explicit choice if set, otherwise the
 * palette colour for its rank when that rank is below {@link MAX_TYPE_COLORS}
 * (see {@link typeColorRanks}), otherwise light grey.
 */
export const resolveTypeColor = ({
  entityTypeId,
  index,
  overrides,
}: {
  entityTypeId: VersionedUrl;
  index: number;
  overrides: TypeColorOverrides;
}): string =>
  overrides.get(entityTypeId) ??
  (index < MAX_TYPE_COLORS
    ? (typeColorPalette[index] ?? unassignedTypeColor)
    : unassignedTypeColor);
