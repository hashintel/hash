import artwork from "./artwork.json";

import type { HashIconName, HashIconVariant } from "../hash-icon";

const drawings = artwork as Record<
  HashIconName,
  Record<HashIconVariant, string>
>;

const supportedVariants = new Set<HashIconVariant>(["outline", "filled"]);

export const getHashIconArtworkTemplate = (
  name: HashIconName,
  variant: HashIconVariant,
  idPrefix: string,
): string => {
  if (
    typeof name !== "string" ||
    !Object.hasOwn(drawings, name) ||
    !supportedVariants.has(variant)
  ) {
    return "";
  }

  return drawings[name][variant].replaceAll(
    /__HASH_ICON_ID_(\d+)__/g,
    `${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "_")}-$1`,
  );
};
