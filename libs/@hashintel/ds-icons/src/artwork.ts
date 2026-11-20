import { getHashIconArtworkTemplate } from "./static/artwork-template";

import type { HashIconName, HashIconVariant } from "./hash-icon";

export type { HashIconName, HashIconVariant } from "./hash-icon";

export const getHashIconStrokeWidth = (weight = 400): number =>
  0.75 +
  (Number.isFinite(weight) ? Math.min(700, Math.max(100, weight)) : 400) / 400;

export const getHashIconArtwork = (
  name: HashIconName,
  variant: HashIconVariant = "outline",
  idPrefix = "hash-icon",
  strokeWidth = getHashIconStrokeWidth(),
): string => {
  const width = Number.isFinite(strokeWidth)
    ? Math.max(0, strokeWidth)
    : getHashIconStrokeWidth();
  return getHashIconArtworkTemplate(name, variant, idPrefix).replaceAll(
    /calc\(var\(--hash-icon-stroke-width\) \* ([\d.]+)\)|var\(--hash-icon-(stroke-width|dot-size|detail-stroke)\)/g,
    (
      _match: string,
      multiplier: string | undefined,
      variable: string | undefined,
    ) => {
      const scale = multiplier
        ? Number(multiplier)
        : variable === "dot-size"
          ? 1.25
          : variable === "detail-stroke"
            ? 1.4
            : 1;
      return String(Number((width * scale).toFixed(6)));
    },
  );
};
