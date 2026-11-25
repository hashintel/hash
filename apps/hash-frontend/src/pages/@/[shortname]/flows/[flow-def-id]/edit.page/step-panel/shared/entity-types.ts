import { useMemo } from "react";

import { useLatestEntityTypesOptional } from "../../../../../../../../shared/entity-types-context/hooks";

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
