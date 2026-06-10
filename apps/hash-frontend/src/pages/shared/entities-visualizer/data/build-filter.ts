import { ignoreNoisySystemTypesFilter } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { hasActiveSemanticQuery } from "./types";

import type { EntitiesFilterState } from "./types";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

const MATCH_NOTHING_WEB_ID = "00000000-0000-0000-0000-000000000000" as WebId;

const buildArchivedClauses = (includeArchived: boolean): Filter[] => {
  if (includeArchived) {
    return [];
  }

  return [
    {
      notEqual: [{ path: ["archived"] }, { parameter: true }],
    },
    {
      any: [
        {
          exists: {
            path: [
              "properties",
              systemPropertyTypes.archived.propertyTypeBaseUrl,
            ],
          },
        },
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.archived.propertyTypeBaseUrl,
              ],
            },
            { parameter: false },
          ],
        },
      ],
    },
  ];
};

const buildWebClause = (
  webState: EntitiesFilterState["web"],
  internalWebIds: WebId[],
): Filter | null => {
  if (!webState.includeOtherWebs) {
    const selected = internalWebIds.filter((id) =>
      webState.selectedInternalWebIds.has(id),
    );

    const webIdsToMatch = selected.length ? selected : [MATCH_NOTHING_WEB_ID];

    return {
      any: webIdsToMatch.map((webId) => ({
        equal: [{ path: ["webId"] }, { parameter: webId }],
      })),
    };
  }

  const uncheckedInternalWebIds = internalWebIds.filter(
    (id) => !webState.selectedInternalWebIds.has(id),
  );

  if (uncheckedInternalWebIds.length === 0) {
    return null;
  }

  return {
    all: uncheckedInternalWebIds.map((webId) => ({
      notEqual: [{ path: ["webId"] }, { parameter: webId }],
    })),
  };
};

const buildTypeClause = ({
  pinnedEntityTypeBaseUrl,
  pinnedEntityTypeIds,
  selectedTypeIds,
}: {
  pinnedEntityTypeBaseUrl?: BaseUrl;
  pinnedEntityTypeIds?: VersionedUrl[];
  selectedTypeIds: Set<VersionedUrl> | null;
}): { clause: Filter | null; isPinned: boolean } => {
  if (pinnedEntityTypeBaseUrl) {
    return {
      clause: {
        equal: [
          { path: ["type", "baseUrl"] },
          { parameter: pinnedEntityTypeBaseUrl },
        ],
      },
      isPinned: true,
    };
  }

  if (pinnedEntityTypeIds?.length) {
    return {
      clause: {
        any: pinnedEntityTypeIds.map((entityTypeId) => ({
          equal: [
            { path: ["type", "versionedUrl"] },
            { parameter: entityTypeId },
          ],
        })),
      },
      isPinned: true,
    };
  }

  if (selectedTypeIds === null) {
    return { clause: null, isPinned: false };
  }

  const typeIds = Array.from(selectedTypeIds);

  if (typeIds.length === 0) {
    return {
      clause: {
        equal: [{ path: ["type", "versionedUrl"] }, { parameter: "" }],
      },
      isPinned: false,
    };
  }

  return {
    clause: {
      any: typeIds.map((entityTypeId) => ({
        equal: [
          { path: ["type", "versionedUrl"] },
          { parameter: entityTypeId },
        ],
      })),
    },
    isPinned: false,
  };
};

/**
 * The maximum cosine distance between the query embedding and an entity's
 * embedding for the entity to count as a match. Mirrors the global search bar
 * (`search-bar.tsx`), which is tuned for the same OpenAI embedding model.
 */
const MAXIMUM_SEMANTIC_DISTANCE = 0.7;

const buildSemanticSearchClause = (
  filterState: EntitiesFilterState,
): Filter | null => {
  if (!hasActiveSemanticQuery(filterState)) {
    return null;
  }

  return {
    cosineDistance: [
      { path: ["embedding"] },
      // The string is embedded server-side before the distance is computed.
      { parameter: filterState.semanticSearch.query.trim() },
      { parameter: MAXIMUM_SEMANTIC_DISTANCE },
    ],
  };
};

export const buildEntitiesFilter = ({
  filterState,
  internalWebIds,
  pinnedEntityTypeBaseUrl,
  pinnedEntityTypeIds,
}: {
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  pinnedEntityTypeBaseUrl?: BaseUrl;
  pinnedEntityTypeIds?: VersionedUrl[];
}): Filter => {
  const clauses: Filter[] = [];

  clauses.push(...buildArchivedClauses(filterState.includeArchived));

  const webClause = buildWebClause(filterState.web, internalWebIds);
  if (webClause) {
    clauses.push(webClause);
  }

  const { clause: typeClause, isPinned: isTypePinned } = buildTypeClause({
    pinnedEntityTypeBaseUrl,
    pinnedEntityTypeIds,
    selectedTypeIds: filterState.type.selectedTypeIds,
  });

  if (typeClause) {
    clauses.push(typeClause);
  }

  const userPickedSpecificTypes =
    !isTypePinned && filterState.type.selectedTypeIds !== null;

  if (!isTypePinned && !userPickedSpecificTypes) {
    clauses.push(ignoreNoisySystemTypesFilter);
  }

  const semanticSearchClause = buildSemanticSearchClause(filterState);
  if (semanticSearchClause) {
    clauses.push(semanticSearchClause);
  }

  return { all: clauses };
};
