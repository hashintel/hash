import { VersionedUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import {
  Entity,
  EntityId,
  EntityTypeWithMetadata,
  OwnedById,
} from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import { List, ListItem, ListItemIcon, ListItemText } from "@mui/material";
import {
  Fragment,
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKey } from "rooks";

import { useQueryEntities } from "../../../components/hooks/use-query-entities";
import { generateEntityLabel } from "../../../lib/entities";
import { useLatestPropertyTypes } from "../../../shared/latest-property-types-context";
import { fuzzySearchBy } from "./fuzzy-search-by";
import {
  MentionSuggesterEntity,
  SubMenuItem,
} from "./mention-suggester/mention-suggester-entity";
import { MentionSuggesterSubheading } from "./mention-suggester/mention-suggester-subheading";
import { MentionSuggesterWrapper } from "./mention-suggester/mention-suggester-wrapper";

export type MentionType = "user" | "page" | "entity";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: EntityId, mentionType: MentionType): void;
  ownedById: OwnedById;
}

type EntitiesByType = Record<
  VersionedUrl,
  { entityType: EntityTypeWithMetadata; entities: Entity[] }
>;

const numberOfEntitiesDisplayedPerSection = 4;

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  ownedById: _ownedById,
}) => {
  const { propertyTypes } = useLatestPropertyTypes();

  const [selectedEntityIndex, setSelectedEntityIndex] = useState(0);

  const [expandedEntityTypes, setExpandedEntityTypes] = useState<
    VersionedUrl[]
  >([]);

  const selectedEntityRef = useRef<HTMLDivElement>(null);

  const [displayEntitySubMenu, setDisplayEntitySubMenu] = useState(false);

  const [entitySelectedSubMenuIndex, setEntitySelectedSubMenuIndex] =
    useState(0);

  // scroll the selected option into view
  useEffect(
    () => selectedEntityRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedEntityIndex],
  );

  const { entitiesSubgraph, loading: loadingEntities } = useQueryEntities({});

  const searchedEntities = useMemo(
    () =>
      entitiesSubgraph
        ? fuzzySearchBy(getRoots(entitiesSubgraph), search, (entity) =>
            generateEntityLabel(entitiesSubgraph, entity),
          )
        : undefined,
    [entitiesSubgraph, search],
  );

  const recentlyUsedEntities = useMemo(
    () =>
      searchedEntities
        ?.sort(
          (a, b) =>
            new Date(
              b.metadata.temporalVersioning.decisionTime.start.limit,
            ).getTime() -
            new Date(
              a.metadata.temporalVersioning.decisionTime.start.limit,
            ).getTime(),
        )
        .slice(0, 5),
    [searchedEntities],
  );

  const entitiesByType = useMemo(
    () =>
      entitiesSubgraph
        ? searchedEntities?.reduce((prev, currentEntity) => {
            const entityType =
              prev[currentEntity.metadata.entityTypeId]?.entityType ??
              getEntityTypeById(
                entitiesSubgraph,
                currentEntity.metadata.entityTypeId,
              );

            if (!entityType) {
              throw new Error("Entity type could not be found in subgraph");
            }

            const isEntityTypeExpanded = expandedEntityTypes.includes(
              entityType.schema.$id,
            );

            return {
              ...prev,
              [currentEntity.metadata.entityTypeId]: {
                entityType,
                entities:
                  isEntityTypeExpanded ||
                  (prev[currentEntity.metadata.entityTypeId]?.entities ?? [])
                    .length < numberOfEntitiesDisplayedPerSection
                    ? [
                        ...(prev[currentEntity.metadata.entityTypeId]
                          ?.entities ?? []),
                        currentEntity,
                      ]
                    : prev[currentEntity.metadata.entityTypeId]?.entities,
              },
            };
          }, {} as EntitiesByType)
        : undefined,
    [searchedEntities, entitiesSubgraph, expandedEntityTypes],
  );

  const selectedEntity = useMemo(
    () =>
      [
        ...(recentlyUsedEntities ?? []),
        ...Object.entries(entitiesByType ?? {}).map(
          ([_, { entities }]) => entities,
        ),
      ].flat()[selectedEntityIndex],
    [recentlyUsedEntities, entitiesByType, selectedEntityIndex],
  );

  const entitiesSubMenuItems = useMemo<
    Record<EntityId, SubMenuItem[]> | undefined
  >(() => {
    if (propertyTypes && searchedEntities) {
      return searchedEntities.reduce(
        (prev, entity) => ({
          ...prev,
          [entity.metadata.recordId.entityId]: Object.entries(
            entity.properties,
          ).map(([propertyTypeBaseUrl, propertyValue]) => {
            const propertyType = Object.values(propertyTypes).find(
              ({ metadata }) =>
                metadata.recordId.baseUrl === propertyTypeBaseUrl,
            );

            if (!propertyType) {
              throw new Error("Property type not found");
            }

            return {
              kind: "property",
              propertyType,
              propertyValue,
            };
          }),
        }),
        {},
      );
    }

    return undefined;
  }, [propertyTypes, searchedEntities]);

  const selectedEntitySubMenuItems = useMemo<SubMenuItem[] | undefined>(() => {
    if (selectedEntity && entitiesSubMenuItems) {
      return entitiesSubMenuItems[selectedEntity.metadata.recordId.entityId];
    }
    return undefined;
  }, [selectedEntity, entitiesSubMenuItems]);

  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();

    if (!searchedEntities) {
      return;
    }

    if (displayEntitySubMenu && selectedEntitySubMenuItems) {
      let index =
        entitySelectedSubMenuIndex + (event.key === "ArrowUp" ? -1 : 1);
      index += selectedEntitySubMenuItems.length;
      index %= selectedEntitySubMenuItems.length;

      setEntitySelectedSubMenuIndex(index);
    } else {
      let index = selectedEntityIndex + (event.key === "ArrowUp" ? -1 : 1);
      const numberOfDisplayedEntities =
        searchedEntities.length + (recentlyUsedEntities?.length ?? 0);

      index += numberOfDisplayedEntities;
      index %= numberOfDisplayedEntities;
      setSelectedEntityIndex(index);
    }
  });

  useKey(["ArrowRight"], (event) => {
    event.preventDefault();

    if (
      !displayEntitySubMenu &&
      selectedEntity &&
      entitiesSubMenuItems?.[selectedEntity.metadata.recordId.entityId]?.length
    ) {
      setDisplayEntitySubMenu(true);
      setEntitySelectedSubMenuIndex(0);
    }
  });

  useKey(["ArrowLeft"], (event) => {
    event.preventDefault();

    if (displayEntitySubMenu) {
      setDisplayEntitySubMenu(false);
    }
  });

  useKey(["Enter"], (event) => {
    event.preventDefault();

    if (!searchedEntities) {
      return;
    }

    const entity = searchedEntities[selectedEntityIndex];

    if (entity) {
      onChange(entity.metadata.recordId.entityId, "entity");
    }
  });

  return (
    <MentionSuggesterWrapper>
      <List sx={{ "> :first-child": { paddingTop: 0 } }}>
        {loadingEntities ? (
          <ListItem>
            <ListItemIcon sx={{ minWidth: "unset" }}>
              <LoadingSpinner />
            </ListItemIcon>
            <ListItemText>Loading</ListItemText>
          </ListItem>
        ) : null}
        <MentionSuggesterSubheading>Recently Used</MentionSuggesterSubheading>
        {entitiesSubgraph
          ? recentlyUsedEntities?.map((entity, index) => (
              <MentionSuggesterEntity
                key={entity.metadata.recordId.entityId}
                entityType={
                  getEntityTypeById(
                    entitiesSubgraph,
                    entity.metadata.entityTypeId,
                  )!
                }
                ref={
                  index === selectedEntityIndex ? selectedEntityRef : undefined
                }
                selected={index === selectedEntityIndex}
                displaySubMenu={
                  index === selectedEntityIndex && displayEntitySubMenu
                }
                subMenuIndex={entitySelectedSubMenuIndex}
                subMenuItems={
                  entitiesSubMenuItems?.[entity.metadata.recordId.entityId] ??
                  []
                }
                displayTypeTitle
                setDisplaySubMenu={(displaySubMenu) => {
                  if (displaySubMenu) {
                    setDisplayEntitySubMenu(true);
                    setSelectedEntityIndex(index);
                  } else {
                    setDisplayEntitySubMenu(false);
                  }
                }}
                entitiesSubgraph={entitiesSubgraph}
                entity={entity}
              />
            ))
          : null}
        {entitiesSubgraph
          ? Object.entries(entitiesByType ?? {}).map(
              (
                [_, { entityType, entities }],
                typeSectionIndex,
                allTypeSections,
              ) => {
                const entityTypeId = entityType.schema.$id;
                const isExpanded = expandedEntityTypes.includes(entityTypeId);

                return (
                  <Fragment key={entityTypeId}>
                    <MentionSuggesterSubheading
                      onClick={() =>
                        setExpandedEntityTypes((prev) =>
                          isExpanded
                            ? prev.filter((id) => id !== entityTypeId)
                            : [...prev, entityTypeId],
                        )
                      }
                    >
                      {entityType.schema.title}
                    </MentionSuggesterSubheading>
                    {entities.map((entity, entityIndex) => {
                      const index =
                        (recentlyUsedEntities?.length ?? 0) +
                        allTypeSections
                          .slice(0, typeSectionIndex)
                          .reduce(
                            (
                              prev,
                              [__, { entities: previousTypeSectionEntities }],
                            ) => prev + previousTypeSectionEntities.length,
                            0,
                          ) +
                        entityIndex;

                      return (
                        <Fragment key={entity.metadata.recordId.entityId}>
                          <MentionSuggesterEntity
                            entityType={entityType}
                            entitiesSubgraph={entitiesSubgraph}
                            entity={entity}
                            ref={
                              index === selectedEntityIndex
                                ? selectedEntityRef
                                : undefined
                            }
                            selected={index === selectedEntityIndex}
                            displaySubMenu={
                              index === selectedEntityIndex &&
                              displayEntitySubMenu
                            }
                            subMenuIndex={entitySelectedSubMenuIndex}
                            subMenuItems={
                              entitiesSubMenuItems?.[
                                entity.metadata.recordId.entityId
                              ] ?? []
                            }
                            setDisplaySubMenu={(displaySubMenu) => {
                              if (displaySubMenu) {
                                setDisplayEntitySubMenu(true);
                                setSelectedEntityIndex(index);
                              } else {
                                setDisplayEntitySubMenu(false);
                              }
                            }}
                          />
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              },
            )
          : null}
      </List>
    </MentionSuggesterWrapper>
  );
};
