/**
 * Pure helpers behind the Dimensions table: the identifier a typed name
 * becomes, the name a fresh dimension starts with, and what stops a name
 * from being committed.
 */

import { isDangerousRecordKey } from "@hashintel/petrinaut-core";

import type { Color, ColorElementType } from "@hashintel/petrinaut-core";

type Dimension = Color["elements"][number];

export const dimensionTypeOptions: { value: ColorElementType; text: string }[] =
  [
    { value: "real", text: "Real" },
    { value: "integer", text: "Integer" },
    { value: "boolean", text: "Boolean" },
    { value: "uuid", text: "UUID" },
    { value: "string", text: "String" },
  ];

/**
 * The identifier a typed name becomes: lower case, runs of anything but
 * letters, digits and underscores collapsed to one underscore, a leading
 * digit prefixed. Empty text stays empty.
 */
export const slugifyToIdentifier = (input: string): string => {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[0-9]/.test(slug) ? `_${slug}` : slug;
};

/** `dimension_n`, one past the highest such name the type already has. */
export const nextDimensionName = (
  elements: readonly Pick<Dimension, "name">[],
): string => {
  let highest = 0;
  for (const element of elements) {
    const match = /^dimension_(\d+)$/i.exec(element.name);
    if (match) {
      highest = Math.max(highest, Number.parseInt(match[1]!, 10));
    }
  }
  return `dimension_${highest + 1}`;
};

/**
 * Why `text` cannot become the name of the element `elementId`: it is
 * empty, the identifier it becomes is one the net's schema reserves, or
 * another dimension already has it. `null` when the name can be committed.
 */
export const dimensionNameError = (
  elements: readonly Pick<Dimension, "elementId" | "name">[],
  elementId: string,
  text: string,
): string | null => {
  const slug = slugifyToIdentifier(text);
  if (slug === "") {
    return "A dimension needs a name";
  }
  if (isDangerousRecordKey(slug)) {
    return `${slug} is a reserved name`;
  }
  const taken = elements.some(
    (element) => element.elementId !== elementId && element.name === slug,
  );
  return taken ? `Another dimension is already named ${slug}` : null;
};
