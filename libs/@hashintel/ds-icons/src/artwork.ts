import artwork from "./static/artwork.json";

import type { HashIconName, HashIconVariant } from "./hash-icon";

export type { HashIconName, HashIconVariant } from "./hash-icon";

const drawings = artwork as Record<
  HashIconName,
  Record<HashIconVariant, string>
>;

export const getHashIconArtwork = (
  name: HashIconName,
  variant: HashIconVariant = "outline",
  idPrefix = "hash-icon",
): string =>
  drawings[name][variant].replaceAll(
    /__HASH_ICON_ID_(\d+)__/g,
    `${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "_")}-$1`,
  );

export const getHashIconStrokeWidth = (weight = 400): number =>
  0.75 +
  (Number.isFinite(weight) ? Math.min(700, Math.max(100, weight)) : 400) / 400;
