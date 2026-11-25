import { useMemo } from "react";

import { validateVersionedUrl } from "@blockprotocol/type-system";

import { useLatestEntityTypesOptional } from "../../../../../../../../shared/entity-types-context/hooks";

import type { VersionedUrl } from "@blockprotocol/type-system";

/** Reads saved entity type IDs back, or `null` if they aren't a list of versioned URLs. */
export const readEntityTypeIds = (value: unknown): VersionedUrl[] | null =>
  Array.isArray(value) &&
  value.every(
    (entityTypeId): entityTypeId is VersionedUrl =>
      typeof entityTypeId === "string" &&
      validateVersionedUrl(entityTypeId).type === "Ok",
  )
    ? value
    : null;

/** The latest version of every entity type, and an item for each to pick it by base URL, sorted by title. */
export const useEntityTypeItems = () => {
  const { latestEntityTypes } = useLatestEntityTypesOptional();

  const typeItems = useMemo(() => {
    const types = latestEntityTypes ?? [];
    const typesByTitle = Map.groupBy(types, ({ schema }) => schema.title);

    return types
      .map(({ schema, metadata }) => {
        const { baseUrl } = metadata.recordId;
        /* Types in different webs may share a title. */
        const web =
          (typesByTitle.get(schema.title)?.length ?? 0) > 1
            ? baseUrl.match(/\/(@[^/]+)/)?.[1]
            : undefined;

        return {
          value: baseUrl,
          text: web ? `${schema.title} (${web})` : schema.title,
        };
      })
      .sort((left, right) => left.text.localeCompare(right.text));
  }, [latestEntityTypes]);

  return { latestEntityTypes, typeItems };
};
