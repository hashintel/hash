import { Filter } from "@local/hash-graph-client";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

const archivedBaseUrl = extractBaseUrl(
  types.propertyType.archived.propertyTypeId,
);

export const notArchivedFilter: Filter = {
  any: [
    {
      equal: [
        {
          path: ["properties", archivedBaseUrl],
        },
        // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
        null,
      ],
    },
    {
      equal: [
        {
          path: ["properties", archivedBaseUrl],
        },
        { parameter: false },
      ],
    },
  ],
};
