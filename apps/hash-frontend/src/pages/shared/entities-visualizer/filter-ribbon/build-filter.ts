import {
  ignoreNoisySystemTypesFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type {
  BaseUrl,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

import type { EntitiesFilterState } from "./types";

/**
 * Valid-format-but-non-existent identifiers used to express
 * "match nothing" filters. The Graph API rejects ill-formed UUID/URL parameters
 * with a request error (causing infinite loading), so when the user has
 * explicitly unchecked every option we still need to send something parseable
 * that yields zero results.
 */
const NIL_WEB_ID = "00000000-0000-0000-0000-000000000000" as WebId;
const NIL_ENTITY_TYPE_ID =
  "https://hash.ai/@none/types/entity-type/none/v/1" as VersionedUrl;

/**
 * Filter clause that excludes archived entities. Archived can live either as
 * the `archived` metadata flag (current) or as a system property (legacy);
 * we need to handle both.
 */
const excludeArchivedFilter: Filter[] = [
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

const buildWebFilter = ({
  filterState,
  internalWebIds,
}: {
  filterState: EntitiesFilterState["web"];
  internalWebIds: WebId[];
}): Filter | null => {
  const { selectedInternalWebIds, includeOtherWebs } = filterState;

  if (!includeOtherWebs) {
    const ids = [...selectedInternalWebIds];
    if (ids.length === 0) {
      return {
        equal: [{ path: ["webId"] }, { parameter: NIL_WEB_ID }],
      };
    }
    return {
      any: ids.map((webId) => ({
        equal: [{ path: ["webId"] }, { parameter: webId }],
      })),
    };
  }

  /**
   * "Other webs" is selected: include everything except the internal webs the
   * user has unchecked -- so if they only checked an org and "Other webs",
   * their personal web is excluded.
   */
  const excludedInternalWebIds = internalWebIds.filter(
    (webId) => !selectedInternalWebIds.has(webId),
  );

  if (excludedInternalWebIds.length === 0) {
    return null;
  }

  return {
    all: excludedInternalWebIds.map((webId) => ({
      notEqual: [{ path: ["webId"] }, { parameter: webId }],
    })),
  };
};

const buildTypeFilter = ({
  filterState,
  entityTypeBaseUrl,
  entityTypeIds,
}: {
  filterState: EntitiesFilterState["type"];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
}): { typeClause: Filter | null; includeNoisyFilter: boolean } => {
  if (entityTypeBaseUrl) {
    return {
      typeClause: {
        equal: [
          { path: ["type", "baseUrl"] },
          { parameter: entityTypeBaseUrl },
        ],
      },
      includeNoisyFilter: false,
    };
  }

  if (entityTypeIds?.length) {
    return {
      typeClause: {
        any: entityTypeIds.map((entityTypeId) => ({
          equal: [
            { path: ["type", "versionedUrl"] },
            { parameter: entityTypeId },
          ],
        })),
      },
      includeNoisyFilter: false,
    };
  }

  const { selectedTypeIds } = filterState;

  if (selectedTypeIds === null) {
    /**
     * Default case: "all types" -- no explicit filter, but still drop the
     * noisy system types so the table isn't drowned in notifications etc.
     */
    return { typeClause: null, includeNoisyFilter: true };
  }

  if (selectedTypeIds.size === 0) {
    /**
     * User has explicitly unchecked all types -- yield zero results rather
     * than silently revert to "all types".
     */
    return {
      typeClause: {
        equal: [
          { path: ["type", "versionedUrl"] },
          { parameter: NIL_ENTITY_TYPE_ID },
        ],
      },
      includeNoisyFilter: false,
    };
  }

  return {
    typeClause: {
      any: [...selectedTypeIds].map((entityTypeId) => ({
        equal: [
          { path: ["type", "versionedUrl"] },
          { parameter: entityTypeId },
        ],
      })),
    },
    includeNoisyFilter: false,
  };
};

export const buildEntitiesFilter = ({
  filterState,
  internalWebIds,
  entityTypeBaseUrl,
  entityTypeIds,
}: {
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
}): Filter => {
  const clauses: Filter[] = [];

  const webClause = buildWebFilter({
    filterState: filterState.web,
    internalWebIds,
  });
  if (webClause) {
    clauses.push(webClause);
  }

  const { typeClause, includeNoisyFilter } = buildTypeFilter({
    filterState: filterState.type,
    entityTypeBaseUrl,
    entityTypeIds,
  });
  if (typeClause) {
    clauses.push(typeClause);
  }
  if (includeNoisyFilter) {
    clauses.push(ignoreNoisySystemTypesFilter);
  }

  const includeArchived =
    filterState.archived.pillAdded && filterState.archived.include;
  if (!includeArchived) {
    clauses.push(...excludeArchivedFilter);
  }

  return { all: clauses };
};

export const getInternalWebIds = (params: {
  userWebId: WebId;
  orgWebIds: WebId[];
}): WebId[] => [params.userWebId, ...params.orgWebIds];

export const getDefaultFilterState = ({
  internalWebIds,
}: {
  internalWebIds: WebId[];
}): EntitiesFilterState => ({
  web: {
    selectedInternalWebIds: new Set<WebId>(internalWebIds),
    includeOtherWebs: false,
  },
  type: { selectedTypeIds: null },
  archived: { pillAdded: false, include: false },
});

export const isFilterStateDefault = (
  filterState: EntitiesFilterState,
  internalWebIds: WebId[],
): boolean => {
  const { web, type, archived } = filterState;

  if (web.includeOtherWebs) {
    return false;
  }
  if (web.selectedInternalWebIds.size !== internalWebIds.length) {
    return false;
  }
  for (const webId of internalWebIds) {
    if (!web.selectedInternalWebIds.has(webId)) {
      return false;
    }
  }

  if (type.selectedTypeIds !== null) {
    return false;
  }

  if (archived.pillAdded) {
    return false;
  }

  return true;
};
