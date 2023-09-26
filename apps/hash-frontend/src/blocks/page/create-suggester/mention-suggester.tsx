import { VersionedUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  EntityId,
  EntityTypeWithMetadata,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { List, ListItem, ListItemIcon, ListItemText } from "@mui/material";
import {
  Fragment,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKey } from "rooks";

import { useScrollLock } from "../../../components/grid/utils/override-custom-renderers/use-scroll-lock";
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

export type Mention =
  | {
      kind: "entity";
      entityId: EntityId;
    }
  | {
      kind: "user";
      entityId: EntityId;
    }
  | {
      kind: "page";
      entityId: EntityId;
    }
  | {
      kind: "property-value";
      entityId: EntityId;
      propertyTypeId: VersionedUrl;
    }
  | {
      kind: "outgoing-link";
      entityId: EntityId;
      linkEntityId: EntityId;
    };

export type MentionKind = Mention["kind"];

export interface MentionSuggesterProps {
  search?: string;
  onChange(mention: Mention): void;
  ownedById: OwnedById;
}

type EntitiesByType = {
  entityType: EntityTypeWithMetadata;
  entities: Entity[];
}[];

const numberOfEntitiesDisplayedPerSection = 4;

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  ownedById: _ownedById,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { propertyTypes } = useLatestPropertyTypes();

  const [selectedEntityIndex, setSelectedEntityIndex] = useState(0);

  const [expandedEntityTypes, setExpandedEntityTypes] = useState<
    VersionedUrl[]
  >([]);

  const selectedEntityRef = useRef<HTMLDivElement>(null);

  const [displayEntitySubMenu, setDisplayEntitySubMenu] = useState(false);

  useScrollLock(displayEntitySubMenu, wrapperRef.current ?? undefined);

  const [entitySelectedSubMenuIndex, setEntitySelectedSubMenuIndex] =
    useState(0);

  // scroll the selected option into view
  useEffect(
    () => selectedEntityRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedEntityIndex],
  );

  const { entitiesSubgraph, loading: loadingEntities } = useQueryEntities({
    graphResolveDepths: {
      hasLeftEntity: { outgoing: 1, incoming: 1 },
      hasRightEntity: { outgoing: 1, incoming: 1 },
    },
  });

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
        ? searchedEntities
            ?.reduce((prev, currentEntity) => {
              const existingIndex = prev.findIndex(
                ({ entityType }) =>
                  entityType.schema.$id === currentEntity.metadata.entityTypeId,
              );

              const entityType =
                prev[existingIndex]?.entityType ??
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

              const previousEntities = prev[existingIndex]?.entities ?? [];

              return existingIndex >= 0
                ? [
                    ...prev.slice(0, existingIndex),
                    {
                      ...prev[existingIndex]!,
                      entities:
                        isEntityTypeExpanded ||
                        previousEntities.length <
                          numberOfEntitiesDisplayedPerSection
                          ? [...previousEntities, currentEntity]
                          : previousEntities,
                    },
                    ...prev.slice(existingIndex + 1),
                  ]
                : [...prev, { entityType, entities: [currentEntity] }];
            }, [] as EntitiesByType)
            .sort((a, b) => {
              const customOrder = {
                [types.entityType.page.entityTypeId]: 0,
                [types.entityType.user.entityTypeId]: 1,
              };

              return (
                (customOrder[a.entityType.schema.$id] ?? 2) -
                (customOrder[b.entityType.schema.$id] ?? 2)
              );
            })
        : undefined,
    [searchedEntities, entitiesSubgraph, expandedEntityTypes],
  );

  const selectedEntity = useMemo(
    () =>
      [
        ...(recentlyUsedEntities ?? []),
        ...(entitiesByType?.map(({ entities }) => entities) ?? []),
      ].flat()[selectedEntityIndex],
    [recentlyUsedEntities, entitiesByType, selectedEntityIndex],
  );

  const entitiesSubMenuItems = useMemo<
    Record<EntityId, SubMenuItem[]> | undefined
  >(() => {
    if (propertyTypes && searchedEntities && entitiesSubgraph) {
      return searchedEntities.reduce((prev, entity) => {
        const properties = Object.entries(entity.properties).map(
          ([propertyTypeBaseUrl, propertyValue]) => {
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
          },
        );

        const outgoingLinks = getOutgoingLinkAndTargetEntities(
          entitiesSubgraph,
          entity.metadata.recordId.entityId,
        ).map<Extract<SubMenuItem, { kind: "outgoing-link" }>>(
          ({
            linkEntity: linkEntityRevisions,
            rightEntity: rightEntityRevisions,
          }) => {
            const [linkEntity] = linkEntityRevisions;
            const [rightEntity] = rightEntityRevisions;

            if (!linkEntity) {
              throw new Error("Link entity not found");
            } else if (!rightEntity) {
              throw new Error("Right entity not found");
            }

            const linkEntityType = getEntityTypeById(
              entitiesSubgraph,
              linkEntity.metadata.entityTypeId,
            )!;

            return {
              kind: "outgoing-link",
              linkEntity,
              linkEntityType,
              targetEntity: rightEntity,
              targetEntityLabel: generateEntityLabel(
                entitiesSubgraph,
                rightEntity,
              ),
            };
          },
        );

        return {
          ...prev,
          [entity.metadata.recordId.entityId]: [
            ...properties,
            ...outgoingLinks,
          ],
        };
      }, {});
    }

    return undefined;
  }, [propertyTypes, searchedEntities, entitiesSubgraph]);

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

  const handleSubmit = useCallback(
    (params?: { subMenuIndex?: number }) => {
      const { subMenuIndex } = params ?? {};
      if (!searchedEntities) {
        return;
      }

      if (selectedEntity) {
        const {
          entityTypeId,
          recordId: { entityId },
        } = selectedEntity.metadata;

        const selectedSubMenuItem = displayEntitySubMenu
          ? selectedEntitySubMenuItems?.[
              subMenuIndex ?? entitySelectedSubMenuIndex
            ]
          : undefined;
        if (selectedSubMenuItem) {
          if (selectedSubMenuItem.kind === "outgoing-link") {
            onChange({
              kind: "outgoing-link",
              entityId,
              linkEntityId:
                selectedSubMenuItem.linkEntity.metadata.recordId.entityId,
            });
          } else {
            onChange({
              kind: "property-value",
              entityId,
              propertyTypeId: selectedSubMenuItem.propertyType.schema.$id,
            });
          }
        } else if (entityTypeId === types.entityType.page.entityTypeId) {
          onChange({ kind: "page", entityId });
        } else if (entityTypeId === types.entityType.user.entityTypeId) {
          onChange({ kind: "user", entityId });
        } else {
          onChange({ kind: "entity", entityId });
        }
      }
    },
    [
      displayEntitySubMenu,
      entitySelectedSubMenuIndex,
      onChange,
      searchedEntities,
      selectedEntity,
      selectedEntitySubMenuItems,
    ],
  );

  useKey(["Enter"], (event) => {
    event.preventDefault();

    handleSubmit();
  });

  return (
    <MentionSuggesterWrapper sx={{}} ref={wrapperRef}>
      <List sx={{ "> :first-child": { paddingTop: 0 } }}>
        {loadingEntities && !entitiesSubgraph ? (
          <ListItem>
            <ListItemIcon sx={{ minWidth: "unset" }}>
              <LoadingSpinner />
            </ListItemIcon>
            <ListItemText>Loading</ListItemText>
          </ListItem>
        ) : null}
        <MentionSuggesterSubheading disabled={displayEntitySubMenu}>
          Recently Used
        </MentionSuggesterSubheading>
        {entitiesSubgraph
          ? recentlyUsedEntities?.map((entity, index) => {
              const selected = index === selectedEntityIndex;
              return (
                <MentionSuggesterEntity
                  key={entity.metadata.recordId.entityId}
                  entityType={
                    getEntityTypeById(
                      entitiesSubgraph,
                      entity.metadata.entityTypeId,
                    )!
                  }
                  ref={selected ? selectedEntityRef : undefined}
                  selected={selected}
                  displaySubMenu={selected && displayEntitySubMenu}
                  disabled={!selected && displayEntitySubMenu}
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
                  onSubMenuClick={(subMenuIndex) =>
                    handleSubmit({ subMenuIndex })
                  }
                />
              );
            })
          : null}
        {entitiesSubgraph
          ? entitiesByType?.map(
              ({ entityType, entities }, typeSectionIndex, allTypeSections) => {
                const entityTypeId = entityType.schema.$id;
                const isExpanded = expandedEntityTypes.includes(entityTypeId);

                return (
                  <Fragment key={entityTypeId}>
                    <MentionSuggesterSubheading
                      disabled={displayEntitySubMenu}
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
                            (prev, { entities: previousTypeSectionEntities }) =>
                              prev + previousTypeSectionEntities.length,
                            0,
                          ) +
                        entityIndex;

                      const selected = index === selectedEntityIndex;

                      return (
                        <Fragment key={entity.metadata.recordId.entityId}>
                          <MentionSuggesterEntity
                            entityType={entityType}
                            entitiesSubgraph={entitiesSubgraph}
                            entity={entity}
                            ref={selected ? selectedEntityRef : undefined}
                            selected={selected}
                            displaySubMenu={selected && displayEntitySubMenu}
                            disabled={!selected && displayEntitySubMenu}
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
                            onSubMenuClick={(subMenuIndex) =>
                              handleSubmit({ subMenuIndex })
                            }
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
