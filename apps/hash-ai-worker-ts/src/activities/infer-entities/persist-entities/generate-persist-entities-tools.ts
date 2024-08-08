import type { JsonObject } from "@blockprotocol/core";

import type { ProposedEntityToolCreationsByType } from "../shared/generate-propose-entities-tools.js";
import type { PropertyValueWithSimplifiedProperties } from "../shared/map-simplified-properties-to-properties.js";

export type ProposedEntityToolUpdatesByType = Record<
  string,
  {
    entityId: number;
    updateEntityId: string;
    properties: Record<string, PropertyValueWithSimplifiedProperties>;
  }[]
>;

const stringifyArray = (array: unknown[]): string =>
  array.map((item) => JSON.stringify(item)).join(", ");

/**
 * Validates that the provided object is a valid ProposedEntitiesByType object.
 * @throws Error if the provided object does not match ProposedEntitiesByType
 */
export const validateProposedEntitiesByType = <
  EntityUpdate extends boolean = false,
>(
  parsedJson: JsonObject,
  update: EntityUpdate,
): parsedJson is EntityUpdate extends true
  ? ProposedEntityToolUpdatesByType
  : ProposedEntityToolCreationsByType => {
  /** @todo: replace this with logic that validates simplified entity type Ids */
  // const maybeVersionedUrls = Object.keys(parsedJson);

  // const invalidVersionedUrls = maybeVersionedUrls.filter(
  //   (maybeVersionedUrl) => {
  //     const result = validateVersionedUrl(maybeVersionedUrl);

  //     return result.type !== "Ok";
  //   },
  // );
  // if (invalidVersionedUrls.length > 0) {
  //   throw new Error(
  //     `Invalid versionedUrls in AI-provided response: ${invalidVersionedUrls.join(
  //       ", ",
  //     )}`,
  //   );
  // }

  const maybeEntitiesArrays = Object.values(parsedJson);

  const invalidArrays = maybeEntitiesArrays.filter((maybeEntitiesArray) => {
    return !Array.isArray(maybeEntitiesArray);
  });

  if (invalidArrays.length > 0) {
    throw new Error(
      `Invalid entities arrays in AI-provided response: ${stringifyArray(
        invalidArrays,
      )}`,
    );
  }

  const invalidEntities = maybeEntitiesArrays.flat().filter((maybeEntity) => {
    if (
      maybeEntity === null ||
      typeof maybeEntity !== "object" ||
      Array.isArray(maybeEntity)
    ) {
      return true;
    }

    if (!("entityId" in maybeEntity)) {
      return true;
    }

    if (
      ("sourceEntityId" in maybeEntity && !("targetEntityId" in maybeEntity)) ||
      (!("sourceEntityId" in maybeEntity) && "targetEntityId" in maybeEntity)
    ) {
      return true;
    }

    if (update && !("updateEntityId" in maybeEntity)) {
      return true;
    }

    return false;
  });

  if (invalidEntities.length > 0) {
    throw new Error(
      `Invalid entities in AI-provided response: ${stringifyArray(
        invalidEntities,
      )}`,
    );
  }

  return true;
};
