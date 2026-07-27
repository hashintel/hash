import { ignoreNoisySystemTypesFilter } from "@local/hash-isomorphic-utils/graph-queries";

import { buildPropertyFilterClause } from "./property-filters/build-property-filter-clause";

import type { EntitiesFilterState } from "./filter-state";
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

export const buildEntitiesFilter = ({
  filterState,
  internalWebIds,
  pinnedEntityTypeBaseUrl,
  pinnedEntityTypeIds,
  typeUniverse,
}: {
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  pinnedEntityTypeBaseUrl?: BaseUrl;
  pinnedEntityTypeIds?: VersionedUrl[];
  /**
   * The type universe: the entity type ids present in the current result set,
   * as reported by `summarizeEntities` over the same web and archive scope
   * (type selection and property filters deliberately dropped — see
   * `useAvailableTypes`). It must stay a superset of the types the main query
   * can return, or rows silently vanish.
   *
   * When there is no explicit type selection, it is sent as an include list so
   * the query planner has an indexable, estimable type clause — the
   * noisy-system-type exclusions alone are unestimable and provoke pathological
   * plans. The exclusions are still applied on top: a multi-type entity can
   * carry a noisy type alongside one from the universe, so the include list
   * alone would not be equivalent.
   */
  typeUniverse?: VersionedUrl[] | null;
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
  } else if (typeUniverse) {
    clauses.push(
      typeUniverse.length
        ? {
            any: typeUniverse.map((entityTypeId) => ({
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: entityTypeId },
              ],
            })),
          }
        : {
            equal: [{ path: ["type", "versionedUrl"] }, { parameter: "" }],
          },
    );
  }

  if (!isTypePinned) {
    clauses.push(ignoreNoisySystemTypesFilter);
  }

  for (const propertyFilter of filterState.propertyFilters) {
    const propertyClause = buildPropertyFilterClause(propertyFilter);

    // An incomplete or invalid filter contributes no clause (it is inert).
    if (propertyClause) {
      clauses.push(propertyClause);
    }
  }

  return { all: clauses };
};
