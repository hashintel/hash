import { brandmarkScale } from "@hashintel/ds-components";

import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * Per-type node colouring for the network graph view: the selectable palette,
 * the default assignment (first {@link MAX_TYPE_COLORS} types by position), and
 * the light grey used for everything else.
 */

/** The most distinct colours offered, and the number auto-assigned by default. */
export const MAX_TYPE_COLORS = 10;

/** The selectable palette — the first ten colours of the Brandmark scale. */
export const typeColorPalette = brandmarkScale(MAX_TYPE_COLORS);

/** Shown for any type without a colour of its own (design-system `gray[40]`). */
export const unassignedTypeColor = "#C1CFDE";

export type TypeColorOverrides = Map<VersionedUrl, string>;

/**
 * The colour for a type: the user's explicit choice if set, otherwise the
 * default for the first {@link MAX_TYPE_COLORS} types by position, otherwise
 * light grey.
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
