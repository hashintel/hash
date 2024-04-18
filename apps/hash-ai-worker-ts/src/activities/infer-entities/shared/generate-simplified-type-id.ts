import type { VersionedUrl } from "@blockprotocol/type-system";
import type { BaseUrl } from "@local/hash-subgraph";

const generateSimplifiedTypeIdFromTitle = (params: {
  title: string;
  postfix?: string;
}) => {
  const { title, postfix } = params;

  /**
   * Remove all non-alphanumeric or non-space characters, then replace
   * all spaces with a hyphen.
   */
  return `${title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/ +/g, "-")}${postfix ? `-${postfix}` : ""}`;
};

export const generateSimplifiedTypeId = <
  T extends VersionedUrl | BaseUrl = VersionedUrl | BaseUrl,
>(params: {
  title: string;
  typeIdOrBaseUrl: T;
  existingTypeMappings: Record<string, T>;
}): {
  simplifiedTypeId: string;
  updatedTypeMappings: Record<string, T>;
} => {
  const { title, typeIdOrBaseUrl, existingTypeMappings } = params;
  let counter = 1;

  let simplifiedTypeId = generateSimplifiedTypeIdFromTitle({ title });

  while (existingTypeMappings[simplifiedTypeId]) {
    counter++;

    simplifiedTypeId = generateSimplifiedTypeIdFromTitle({
      title,
      postfix: counter.toString(),
    });
  }

  return {
    simplifiedTypeId,
    updatedTypeMappings: {
      ...existingTypeMappings,
      [simplifiedTypeId]: typeIdOrBaseUrl,
    },
  };
};
