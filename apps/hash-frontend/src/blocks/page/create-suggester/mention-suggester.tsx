import { VersionedUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
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

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  ownedById: _ownedById,
}) => {
  const { propertyTypes } = useLatestPropertyTypes();

  const [selectedEntityIndex, setSelectedEntityIndex] = useState(0);

  const selectedEntityRef = useRef<HTMLDivElement>(null);

  const [displayEntitySubMenu, setDisplayEntitySubMenu] = useState(false);

  const [entitySelectedSubMenuIndex, setEntitySelectedSubMenuIndex] =
    useState(0);

  // scroll the selected option into view
  useEffect(
    () => selectedEntityRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedEntityIndex],
  );

  const { entitiesSubgraph, loading: loadingEntities } = useQueryEntities({
    excludeEntityTypeIds: [
      types.entityType.user.entityTypeId,
      types.entityType.page.entityTypeId,
    ],
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

  // reset selected index if it exceeds the options available
  if (searchedEntities && selectedEntityIndex >= searchedEntities.length) {
    setSelectedEntityIndex(searchedEntities.length - 1);
  }

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
        ? searchedEntities?.reduce(
            (prev, currentEntity) => {
              const entityType =
                prev[currentEntity.metadata.entityTypeId]?.entityType ??
                getEntityTypeById(
                  entitiesSubgraph,
                  currentEntity.metadata.entityTypeId,
                );

              return {
                ...prev,
                [currentEntity.metadata.entityTypeId]: {
                  entityType,
                  entities: [
                    ...(prev[currentEntity.metadata.entityTypeId]?.entities ??
                      []),
                    currentEntity,
                  ],
                },
              };
            },
            {} as Record<
              VersionedUrl,
              { entityType: EntityTypeWithMetadata; entities: Entity[] }
            >,
          )
        : undefined,
    [searchedEntities, entitiesSubgraph],
  );

  const selectedEntity = searchedEntities?.[selectedEntityIndex];

  const selectedEntitySubMenuItems = useMemo<SubMenuItem[] | undefined>(() => {
    if (selectedEntity && propertyTypes) {
      return Object.entries(selectedEntity.properties).map(
        ([propertyTypeBaseUrl, propertyValue]) => {
          const propertyType = Object.values(propertyTypes).find(
            ({ metadata }) => metadata.recordId.baseUrl === propertyTypeBaseUrl,
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
    }
    return undefined;
  }, [selectedEntity, propertyTypes]);

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
      index += searchedEntities.length;
      index %= searchedEntities.length;
      setSelectedEntityIndex(index);
    }
  });

  useKey(["ArrowRight"], (event) => {
    event.preventDefault();

    if (!displayEntitySubMenu) {
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
                  index === selectedEntityIndex
                    ? selectedEntitySubMenuItems ?? []
                    : []
                }
                displayTypeTitle
                entitiesSubgraph={entitiesSubgraph}
                entity={entity}
              />
            ))
          : null}
        {entitiesSubgraph
          ? Object.entries(entitiesByType ?? {}).map(
              ([_, { entityType, entities }]) => (
                <Fragment key={entityType.schema.$id}>
                  <MentionSuggesterSubheading href={entityType.schema.$id}>
                    {entityType.schema.title}
                  </MentionSuggesterSubheading>
                  {entities.map((entity) => (
                    <Fragment key={entity.metadata.recordId.entityId}>
                      <MentionSuggesterEntity
                        entityType={entityType}
                        entitiesSubgraph={entitiesSubgraph}
                        entity={entity}
                        displaySubMenu={false}
                        subMenuIndex={entitySelectedSubMenuIndex}
                        subMenuItems={[]}
                      />
                    </Fragment>
                  ))}
                </Fragment>
              ),
            )
          : null}
      </List>
    </MentionSuggesterWrapper>
  );
};
