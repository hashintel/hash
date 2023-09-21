import { VersionedUrl } from "@blockprotocol/type-system";
import { AsteriskRegularIcon, LoadingSpinner } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  EntityId,
  EntityRootType,
  EntityTypeWithMetadata,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemButtonProps,
  ListItemIcon,
  ListItemText,
  listItemTextClasses,
  Typography,
} from "@mui/material";
import {
  forwardRef,
  Fragment,
  FunctionComponent,
  PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKey } from "rooks";

import { useQueryEntities } from "../../../components/hooks/use-query-entities";
import { generateEntityLabel } from "../../../lib/entities";
import { ArrowUpRightRegularIcon } from "../../../shared/icons/arrow-up-right-regular-icon";
import { ChevronRightRegularIcon } from "../../../shared/icons/chevron-right-regular-icon";
import { Link } from "../../../shared/ui";
import { fuzzySearchBy } from "./fuzzy-search-by";

export type MentionType = "user" | "page" | "entity";
export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: EntityId, mentionType: MentionType): void;
  ownedById: OwnedById;
}

const MentionSuggesterSubheading: FunctionComponent<
  PropsWithChildren & { href?: string }
> = ({ children, href }) => {
  const content = (
    <ListItemText
      sx={{
        [`& .${listItemTextClasses.primary}`]: {
          fontSize: 12,
          fontWeight: 600,
          color: ({ palette }) => palette.gray[60],
          textTransform: "uppercase",
        },
      }}
    >
      {children}
      {href ? (
        <ArrowUpRightRegularIcon
          sx={{ fontSize: 12, position: "relative", top: 1, marginLeft: 1 }}
        />
      ) : null}
    </ListItemText>
  );

  return href ? (
    <Link href={href} sx={{ textDecoration: "none" }}>
      <ListItemButton
        sx={{
          paddingBottom: 0,
          transition: ({ transitions }) => transitions.create("color"),
          "&:hover": {
            background: "transparent",
            color: ({ palette }) => palette.gray[80],
          },
        }}
      >
        {content}
      </ListItemButton>
    </Link>
  ) : (
    <ListItem sx={{ paddingBottom: 0 }}>{content}</ListItem>
  );
};

const MentionSuggesterEntity = forwardRef<
  HTMLDivElement,
  {
    entitiesSubgraph: Subgraph<EntityRootType>;
    entityType: EntityTypeWithMetadata;
    entity: Entity;
    displayTypeTitle?: boolean;
  } & ListItemButtonProps
>(
  (
    {
      entitiesSubgraph,
      entity,
      displayTypeTitle = false,
      entityType,
      ...listItemButtonProps
    },
    ref,
  ) => {
    return (
      <ListItemButton ref={ref} {...listItemButtonProps}>
        <ListItemIcon sx={{ minWidth: "unset" }}>
          <AsteriskRegularIcon />
        </ListItemIcon>
        <ListItemText
          sx={{
            [`& .${listItemTextClasses.primary}`]: {
              fontSize: 14,
              fontWeight: 500,
              color: ({ palette }) => palette.gray[90],
              lineHeight: "18px",
            },
          }}
        >
          {generateEntityLabel(entitiesSubgraph, entity)}
        </ListItemText>
        <Box display="flex" alignItems="center" gap={1}>
          {displayTypeTitle ? (
            <Typography
              sx={{
                fontSize: 14,
                color: ({ palette }) => palette.gray[50],
                fontWeight: 500,
                lineHeight: "18px",
              }}
            >
              {entityType.schema.title}
            </Typography>
          ) : null}
          <ChevronRightRegularIcon
            sx={{
              fontSize: 12,
              color: ({ palette }) => palette.gray[50],
            }}
          />
        </Box>
      </ListItemButton>
    );
  },
);

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  ownedById: _ownedById,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedRef = useRef<HTMLDivElement>(null);

  // scroll the selected option into view
  useEffect(
    () => selectedRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedIndex],
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
  if (searchedEntities && selectedIndex >= searchedEntities.length) {
    setSelectedIndex(searchedEntities.length - 1);
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

  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();

    if (!searchedEntities) {
      return;
    }

    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += searchedEntities.length;
    index %= searchedEntities.length;
    setSelectedIndex(index);
  });

  useKey(["Enter"], (event) => {
    event.preventDefault();

    if (!searchedEntities) {
      return;
    }

    const entity = searchedEntities[selectedIndex];

    if (entity) {
      onChange(entity.metadata.recordId.entityId, "entity");
    }
  });

  return (
    <Box
      sx={({ palette }) => ({
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: palette.gray[20],
        borderRadius: "6px",
        width: 330,
        maxHeight: 400,
        boxShadow:
          "0px 20px 41px rgba(61, 78, 133, 0.07), 0px 16px 25px rgba(61, 78, 133, 0.0531481), 0px 12px 12px rgba(61, 78, 133, 0.0325), 0px 2px 3.13px rgba(61, 78, 133, 0.02)",
        overflowY: "scroll",
      })}
    >
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
                ref={index === selectedIndex ? selectedRef : undefined}
                selected={index === selectedIndex}
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
                      />
                    </Fragment>
                  ))}
                </Fragment>
              ),
            )
          : null}
      </List>
    </Box>
  );
};
