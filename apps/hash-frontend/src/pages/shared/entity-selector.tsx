import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import type {
  Chip,
  SelectorAutocomplete,
  SelectorAutocompleteProps,
  TypeListSelectorDropdownProps,
} from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  entityIdFromComponents,
  EntityRootType,
  extractDraftIdFromEntityId,
  splitEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

type EntitySelectorProps<Multiple extends boolean = false> = Omit<
  SelectorAutocompleteProps<Entity, Multiple>,
  | "inputValue"
  | "loading"
  | "options"
  | "onSelect"
  | "onInputChange"
  | "optionToRenderData"
  | "dropdownProps"
> & {
  dropdownProps?: Omit<TypeListSelectorDropdownProps, "query">;
  expectedEntityTypes?: EntityTypeWithMetadata[];
  entityIdsToFilterOut?: EntityId[];
  includeDrafts: boolean;
  multiple?: Multiple;
  onSelect: (
    event: Multiple extends true ? Entity[] : Entity,
    sourceSubgraph: Subgraph<EntityRootType> | null,
  ) => void;
  value?: Multiple extends true ? Entity : Entity[];
};

export const EntitySelector = <Multiple extends boolean>({
  expectedEntityTypes,
  entityIdsToFilterOut,
  includeDrafts,
  onSelect,
  ...autocompleteProps
}: EntitySelectorProps<Multiple>) => {
  const [query, setQuery] = useState("");

  const { data: entitiesData, loading } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      request: {
        filter:
          !expectedEntityTypes || expectedEntityTypes.length === 0
            ? { all: [] }
            : {
                any: expectedEntityTypes.map(({ schema }) =>
                  generateVersionedUrlMatchingFilter(schema.$id, {
                    ignoreParents: true,
                  }),
                ),
              },
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
        },
        includeDrafts,
      },
      includePermissions: false,
    },
  });

  const entitiesSubgraph = entitiesData
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        entitiesData.getEntitySubgraph.subgraph,
      )
    : undefined;

  const sortedAndFilteredEntities = useMemo(() => {
    if (!entitiesSubgraph) {
      return [];
    }
    const subgraphRoots = getRoots(entitiesSubgraph);

    const hasLiveVersion: Record<EntityId, boolean> = {};

    return subgraphRoots
      .filter((entity) => {
        const rootEntityId = entity.metadata.recordId.entityId;

        if (entity.metadata.archived) {
          return false;
        }

        if (entityIdsToFilterOut?.includes(rootEntityId)) {
          return false;
        }

        if (includeDrafts) {
          /**
           * If we have included drafts in the query, we may have multiple roots for a single entity for the current
           * time, in the case where it has a 'live' (non-draft) version and one or more unarchived draft updates.
           *
           * We only want one result, which should be the live version if it exists, or the single draft if there's no
           * live. Entities without a live version can't have multiple drafts at a point in time because there's
           * nothing to fork multiple from.
           */
          const [ownedById, entityUuid, draftId] = splitEntityId(rootEntityId);

          if (!draftId) {
            /** If there is no draftId, this is the live version, which is always preferred in the selector */
            hasLiveVersion[rootEntityId] = true;

            return true;
          }

          /** This has a draftId, and therefore is only permitted if there is no live version */
          const liveEntityId = entityIdFromComponents(ownedById, entityUuid);

          if (hasLiveVersion[liveEntityId]) {
            /**
             * We already checked for this entityId and there is a live version.
             */
            return false;
          }
          if (
            subgraphRoots.some(
              (possiblyLiveEntity) =>
                possiblyLiveEntity.metadata.recordId.entityId === liveEntityId,
            )
          ) {
            hasLiveVersion[liveEntityId] = true;

            return false;
          }
          /**
           * We don't bother to memoize a false result because there will only one draft version if there isn't a live,
           * and therefore we're not going to see this liveEntityId again in the loop.
           */
        }

        return true;
      })
      .sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      );
  }, [entitiesSubgraph, entityIdsToFilterOut, includeDrafts]);

  return (
    <SelectorAutocomplete<Entity, Multiple>
      loading={loading}
      inputValue={query}
      options={sortedAndFilteredEntities}
      inputPlaceholder={"Search for an entity"}
      isOptionEqualToValue={(option, value) =>
        option.metadata.recordId.entityId === value.metadata.recordId.entityId
      }
      optionToRenderData={(entity) => {
        return {
          entityProperties: entity.properties,
          uniqueId: entity.metadata.recordId.entityId,
          icon: null,
          /**
           * @todo Update SelectorAutocomplete to show an entity's namespace as well as / instead of its entityTypeId.
           */
          typeId: entity.metadata.entityTypeId,
          title: generateEntityLabel(entitiesSubgraph!, entity),
          draft: Boolean(
            extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
          ),
        };
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.metadata.recordId.entityId}
            variant={"outlined"}
            label={generateEntityLabel(entitiesSubgraph!, option)}
          />
        ))
      }
      onInputChange={(_, value) => {
        setQuery(value);
      }}
      onChange={(_, option) => {
        onSelect(option, entitiesSubgraph ?? null);
      }}
      {...autocompleteProps}
      dropdownProps={{
        query,
        ...autocompleteProps.dropdownProps,
      }}
    />
  );
};
