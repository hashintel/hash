import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

export const generateSimplifiedTypeIdFromTitle = (params: {
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
  existingReverseTypeMappings: Record<T, string>;
}): {
  simplifiedTypeId: string;
  updatedTypeMappings: Record<string, T>;
  updatedReverseTypeMappings: Record<T, string>;
} => {
  const {
    title,
    typeIdOrBaseUrl,
    existingTypeMappings,
    existingReverseTypeMappings,
  } = params;
  let counter = 1;

  if (existingReverseTypeMappings[typeIdOrBaseUrl]) {
    return {
      simplifiedTypeId: existingReverseTypeMappings[typeIdOrBaseUrl],
      updatedTypeMappings: existingTypeMappings,
      updatedReverseTypeMappings: existingReverseTypeMappings,
    };
  }

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
    updatedReverseTypeMappings: {
      ...existingReverseTypeMappings,
      [typeIdOrBaseUrl]: simplifiedTypeId,
    },
  };
};
