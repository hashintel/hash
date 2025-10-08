import { useQuery } from "@apollo/client";
import type { EntityId, EntityType } from "@blockprotocol/type-system";
import {
  entityIdFromComponents,
  extractDraftIdFromEntityId,
  mustHaveAtLeastOne,
  splitEntityId,
} from "@blockprotocol/type-system";
import type {
  SelectorAutocompleteProps,
  TypeListSelectorDropdownProps,
} from "@hashintel/design-system";
import { Chip, SelectorAutocomplete } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useMemo, useState } from "react";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";

type EntitySelectorProps<Multiple extends boolean = false> = Omit<
  SelectorAutocompleteProps<HashEntity, Multiple>,
  | "inputValue"
  | "loading"
  | "options"
  | "onSelect"
  | "onInputChange"
  | "optionToRenderData"
  | "dropdownProps"
> & {
  dropdownProps?: Omit<TypeListSelectorDropdownProps, "query">;
  expectedEntityTypes?: Pick<EntityType, "$id">[];
  entityIdsToFilterOut?: EntityId[];
  includeDrafts: boolean;
  multiple?: Multiple;
  onSelect: (
    event: Multiple extends true ? HashEntity[] : HashEntity,
    closedMultiEntityTypeMap: ClosedMultiEntityTypesRootMap,
  ) => void;
  value?: Multiple extends true ? HashEntity : HashEntity[];
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
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter:
          !expectedEntityTypes || expectedEntityTypes.length === 0
            ? { all: [] }
            : {
                any: expectedEntityTypes.map(({ $id }) =>
                  generateVersionedUrlMatchingFilter($id, {
                    ignoreParents: false,
                  }),
                ),
              },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts,
        includeEntityTypes: "resolved",
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  const entities = entitiesData
    ? entitiesData.queryEntities.entities
    : undefined;

  const closedMultiEntityTypesRootMap =
    entitiesData?.queryEntities.closedMultiEntityTypes;

  const sortedAndFilteredEntities = useMemo(() => {
    if (!entities) {
      return [];
    }

    const hasLiveVersion: Record<EntityId, boolean> = {};

    return entities
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
          const [webId, entityUuid, draftId] = splitEntityId(rootEntityId);
          if (!draftId) {
            /** If there is no draftId, this is the live version, which is always preferred in the selector */
            hasLiveVersion[rootEntityId] = true;
            return true;
          }

          /** This has a draftId, and therefore is only permitted if there is no live version */
          const liveEntityId = entityIdFromComponents(webId, entityUuid);
          if (hasLiveVersion[liveEntityId]) {
            /**
             * We already checked for this entityId and there is a live version
             */
            return false;
          }
          if (
            entities.some(
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
  }, [entities, entityIdsToFilterOut, includeDrafts]);

  return (
    <SelectorAutocomplete<HashEntity, Multiple>
      loading={loading}
      onChange={(_, option) => {
        if (!closedMultiEntityTypesRootMap) {
          throw new Error(
            "Cannot select an entity without a closed multi entity types map",
          );
        }

        onSelect(option, closedMultiEntityTypesRootMap);
      }}
      inputValue={query}
      isOptionEqualToValue={(option, value) =>
        option.metadata.recordId.entityId === value.metadata.recordId.entityId
      }
      onInputChange={(_, value) => setQuery(value)}
      options={sortedAndFilteredEntities}
      optionToRenderData={(entity) => {
        const typesMap = entitiesData?.queryEntities.closedMultiEntityTypes;

        if (!typesMap) {
          throw new Error(
            "Cannot render an entity without a closed multi entity types map",
          );
        }

        const closedType = getClosedMultiEntityTypeFromMap(
          typesMap,
          entity.metadata.entityTypeIds,
        );

        const { icon: entityIcon } =
          getDisplayFieldsForClosedEntityType(closedType);

        return {
          entityProperties: entity.properties,
          uniqueId: entity.metadata.recordId.entityId,
          icon: entityIcon ?? null,
          /**
           * @todo update SelectorAutocomplete to show an entity's namespace as well as / instead of its entityTypeId
           * */
          types: mustHaveAtLeastOne(
            closedType.allOf.map((type) => {
              const { icon: typeIcon } =
                getDisplayFieldsForClosedEntityType(type);

              return {
                $id: type.$id,
                icon: typeIcon,
                title: type.title,
              };
            }),
          ),
          title: generateEntityLabel(closedType, entity),
          draft: !!extractDraftIdFromEntityId(
            entity.metadata.recordId.entityId,
          ),
        };
      }}
      inputPlaceholder="Search for an entity"
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => {
          const typesMap = entitiesData?.queryEntities.closedMultiEntityTypes;

          if (!typesMap) {
            throw new Error(
              "Cannot render an entity without a closed multi entity types map",
            );
          }

          const closedType = getClosedMultiEntityTypeFromMap(
            typesMap,
            option.metadata.entityTypeIds,
          );

          return (
            <Chip
              {...getTagProps({ index })}
              key={option.metadata.recordId.entityId}
              variant="outlined"
              label={generateEntityLabel(closedType, option)}
            />
          );
        })
      }
      {...autocompleteProps}
      dropdownProps={{
        query,
        ...autocompleteProps.dropdownProps,
      }}
    />
  );
};
