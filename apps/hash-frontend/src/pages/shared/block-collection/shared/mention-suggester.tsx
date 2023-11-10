import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  isPageEntityTypeId,
  pageEntityTypeIds,
} from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/types";
import {
  BaseUrl,
  Entity,
  EntityId,
  EntityRootType,
  EntityTypeWithMetadata,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
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

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { generateEntityLabel } from "../../../../lib/entities";
import { isPageArchived } from "../../../../shared/is-archived";
import { isEntityPageEntity } from "../../../../shared/is-of-type";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useScrollLock } from "../../../../shared/use-scroll-lock";
import { useAuthenticatedUser } from "../../auth-info-context";
import { fuzzySearchBy } from "./fuzzy-search-by";
import {
  MentionSuggesterEntity,
  SortOrder,
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
      propertyTypeBaseUrl: BaseUrl;
    }
  | {
      kind: "outgoing-link";
      entityId: EntityId;
      linkEntityTypeBaseUrl: BaseUrl;
    };

export type MentionKind = Mention["kind"];

export interface MentionSuggesterProps {
  search?: string;
  onChange(mention: Mention): void;
  ownedById: OwnedById;
}

type EntitiesByType = {
  entityType: EntityTypeWithMetadata;
  displayedEntities: Entity[];
  allEntities: Entity[];
}[];

const numberOfEntitiesDisplayedPerSection = 4;

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  ownedById: _ownedById,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { propertyTypes } = usePropertyTypes();

  const [selectedEntityIndex, setSelectedEntityIndex] = useState(0);

  const [expandedEntityTypes, setExpandedEntityTypes] = useState<
    VersionedUrl[]
  >([]);

  const selectedEntityRef = useRef<HTMLDivElement>(null);

  const [displayEntitySubMenu, setDisplayEntitySubMenu] = useState(false);

  const [entitySubMenuSortOrder, setEntitySubMenuSortOrder] =
    useState<SortOrder>("asc");

  useScrollLock(displayEntitySubMenu, wrapperRef.current ?? undefined);

  const [entitySelectedSubMenuIndex, setEntitySelectedSubMenuIndex] =
    useState(0);

  // scroll the selected option into view
  useEffect(
    () => selectedEntityRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedEntityIndex],
  );

  const { data, loading: loadingEntities } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          any: [
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser.accountId },
              ],
            },
            ...authenticatedUser.memberOf.map(
              ({ org: { accountGroupId } }) => ({
                equal: [{ path: ["ownedById"] }, { parameter: accountGroupId }],
              }),
            ),
            generateVersionedUrlMatchingFilter(
              systemTypes.entityType.user.entityTypeId,
              { ignoreParents: true },
            ),
            generateVersionedUrlMatchingFilter(
              systemTypes.entityType.org.entityTypeId,
              { ignoreParents: true },
            ),
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  const entitiesSubgraph = data
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.structuralQueryEntities.subgraph,
      )
    : undefined;

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
            ?.reduce(
              (prev, currentEntity) => {
                if (
                  isEntityPageEntity(currentEntity) &&
                  isPageArchived(currentEntity)
                ) {
                  return prev;
                }

                const existingIndex = prev.findIndex(
                  ({ entityType }) =>
                    entityType.schema.$id ===
                    currentEntity.metadata.entityTypeId,
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

                const previousEntities = prev[existingIndex]?.allEntities ?? [];

                return existingIndex >= 0
                  ? [
                      ...prev.slice(0, existingIndex),
                      {
                        ...prev[existingIndex]!,
                        allEntities: [...previousEntities, currentEntity],
                      },
                      ...prev.slice(existingIndex + 1),
                    ]
                  : [
                      ...prev,
                      {
                        entityType,
                        displayedEntities: [currentEntity],
                        allEntities: [currentEntity],
                      },
                    ];
              },
              [] as Omit<EntitiesByType[number], "displayedEntities">[],
            )
            .map<EntitiesByType[number]>(({ allEntities, entityType }) => {
              // Sort the entities to ensure the user's entities are displayed first
              const sortedEntities = allEntities.sort((a, b) => {
                const isAInUserAccount =
                  extractOwnedByIdFromEntityId(a.metadata.recordId.entityId) ===
                  authenticatedUser.accountId;
                const isBInUserAccount =
                  extractOwnedByIdFromEntityId(b.metadata.recordId.entityId) ===
                  authenticatedUser.accountId;

                if (isAInUserAccount && !isBInUserAccount) {
                  return -1;
                } else if (isBInUserAccount && !isAInUserAccount) {
                  return 1;
                }
                return 0;
              });

              const isEntityTypeExpanded = expandedEntityTypes.includes(
                entityType.schema.$id,
              );

              const displayedEntities = isEntityTypeExpanded
                ? sortedEntities
                : sortedEntities.slice(0, numberOfEntitiesDisplayedPerSection);

              return {
                entityType,
                displayedEntities,
                allEntities: sortedEntities,
              };
            })
            // Sort the sections to ensure page entities and user entities are displayed first
            .sort((a, b) => {
              const customOrder: { [key: VersionedUrl]: number } = {};

              for (const versionedUrl of pageEntityTypeIds) {
                customOrder[versionedUrl] = 0;
              }

              const nextPriority = Object.values(customOrder).length;

              customOrder[systemTypes.entityType.user.entityTypeId] =
                nextPriority;

              const fallbackPriority = nextPriority + 1;

              return (
                (customOrder[a.entityType.schema.$id] ?? fallbackPriority) -
                (customOrder[b.entityType.schema.$id] ?? fallbackPriority)
              );
            })
        : undefined,
    [
      searchedEntities,
      entitiesSubgraph,
      expandedEntityTypes,
      authenticatedUser,
    ],
  );

  const selectedEntity = useMemo(
    () =>
      [
        ...(recentlyUsedEntities ?? []),
        ...(entitiesByType?.map(({ displayedEntities }) => displayedEntities) ??
          []),
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
            } as const;
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
          ].sort((a, b) => {
            const aItemLabel =
              a.kind === "outgoing-link"
                ? a.linkEntityType.schema.title
                : a.propertyType.schema.title;

            const bItemLabel =
              b.kind === "outgoing-link"
                ? b.linkEntityType.schema.title
                : b.propertyType.schema.title;

            return entitySubMenuSortOrder === "asc"
              ? aItemLabel.toLowerCase().localeCompare(bItemLabel.toLowerCase())
              : bItemLabel
                  .toLowerCase()
                  .localeCompare(aItemLabel.toLowerCase());
          }),
        };
      }, {});
    }

    return undefined;
  }, [
    propertyTypes,
    searchedEntities,
    entitiesSubgraph,
    entitySubMenuSortOrder,
  ]);

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
    (params?: { entity?: Entity; subMenuIndex?: number }) => {
      const { subMenuIndex } = params ?? {};
      if (!searchedEntities) {
        return;
      }

      const entity = params?.entity ?? selectedEntity;

      if (entity) {
        const {
          entityTypeId,
          recordId: { entityId },
        } = entity.metadata;

        const selectedSubMenuItem = displayEntitySubMenu
          ? selectedEntitySubMenuItems?.[
              subMenuIndex ?? entitySelectedSubMenuIndex
            ]
          : undefined;
        if (selectedSubMenuItem) {
          if (selectedSubMenuItem.kind === "outgoing-link") {
            const linkEntityTypeBaseUrl = extractBaseUrl(
              selectedSubMenuItem.linkEntity.metadata.entityTypeId,
            );

            onChange({
              kind: "outgoing-link",
              entityId,
              linkEntityTypeBaseUrl,
            });
          } else {
            const propertyTypeBaseUrl = extractBaseUrl(
              selectedSubMenuItem.propertyType.schema.$id,
            );

            onChange({
              kind: "property-value",
              entityId,
              propertyTypeBaseUrl,
            });
          }
        } else if (isPageEntityTypeId(entityTypeId)) {
          onChange({ kind: "page", entityId });
        } else if (entityTypeId === systemTypes.entityType.user.entityTypeId) {
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

  useKey(["Enter", "Tab"], (event) => {
    event.preventDefault();

    handleSubmit();
  });

  return (
    <MentionSuggesterWrapper sx={{}} ref={wrapperRef}>
      <List sx={{ "> :first-child": { paddingTop: 0 } }}>
        <MentionSuggesterSubheading disabled={displayEntitySubMenu}>
          Recently Used
        </MentionSuggesterSubheading>
        {loadingEntities && !entitiesSubgraph ? (
          <ListItem>
            <ListItemIcon sx={{ minWidth: "unset" }}>
              <LoadingSpinner />
            </ListItemIcon>
            <ListItemText>Loading</ListItemText>
          </ListItem>
        ) : null}
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
                  sortOrder={entitySubMenuSortOrder}
                  setSortOrder={setEntitySubMenuSortOrder}
                  onClick={() => handleSubmit({ entity })}
                />
              );
            })
          : null}
        {entitiesSubgraph
          ? entitiesByType?.map(
              (
                { entityType, displayedEntities, allEntities },
                typeSectionIndex,
                allTypeSections,
              ) => {
                const entityTypeId = entityType.schema.$id;
                const isExpanded = expandedEntityTypes.includes(entityTypeId);

                return (
                  <Fragment key={entityTypeId}>
                    <MentionSuggesterSubheading
                      disabled={displayEntitySubMenu}
                      onClick={
                        allEntities.length > numberOfEntitiesDisplayedPerSection
                          ? () =>
                              setExpandedEntityTypes((prev) =>
                                isExpanded
                                  ? prev.filter((id) => id !== entityTypeId)
                                  : [...prev, entityTypeId],
                              )
                          : undefined
                      }
                      open={isExpanded}
                      sx={{ marginTop: 0.5 }}
                    >
                      {entityType.schema.title}
                    </MentionSuggesterSubheading>
                    {displayedEntities.map((entity, entityIndex) => {
                      const index =
                        (recentlyUsedEntities?.length ?? 0) +
                        allTypeSections
                          .slice(0, typeSectionIndex)
                          .reduce(
                            (
                              prev,
                              {
                                displayedEntities: previousTypeSectionEntities,
                              },
                            ) => prev + previousTypeSectionEntities.length,
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
                            sortOrder={entitySubMenuSortOrder}
                            setSortOrder={setEntitySubMenuSortOrder}
                            onClick={() => handleSubmit({ entity })}
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
