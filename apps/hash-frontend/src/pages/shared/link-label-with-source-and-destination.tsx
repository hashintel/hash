import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getEntityRevision,
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getPropertyTypeForEntity,
} from "@blockprotocol/graph/stdlib";
import type {
  Entity,
  EntityId,
  EntityType,
  EntityTypeWithMetadata,
  LinkEntity,
  PropertyValue,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractVersion,
} from "@blockprotocol/type-system";
import {
  EntityOrTypeIcon,
  EyeSlashRegularIcon,
} from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
  getPropertyTypeForClosedMultiEntityType,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { BoxProps } from "@mui/material";
import {
  Box,
  Stack,
  styled,
  Tooltip,
  Typography,
  typographyClasses,
  useTheme,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { Fragment, useMemo, useRef } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { Link } from "../../shared/ui";
import { useEntityEditor } from "./entity/entity-editor/entity-editor-context";
import { TooltipChip } from "./tooltip-chip";

const ContentTypography = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  color: theme.palette.common.black,
  fontWeight: 600,
  transition: theme.transitions.create("color"),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const stringifyEntityPropertyValue = (value: PropertyValue): string => {
  if (Array.isArray(value)) {
    return value.map(stringifyEntityPropertyValue).join(", ");
  } else if (typeof value === "boolean") {
    return value ? "True" : "False";
  } else if (typeof value === "undefined") {
    return "Undefined";
  } else {
    return stringifyPropertyValue(value);
  }
};

const LeftOrRightEntity: FunctionComponent<{
  closedMultiEntityTypesMap: ClosedMultiEntityTypesRootMap | null;
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions | null;
  endAdornment?: ReactNode;
  entity?: Entity;
  label?: ReactNode;
  onEntityClick?: (entityId: EntityId) => void;
  openInNew?: boolean;
  subgraph: Subgraph<EntityRootType>;
  sx?: BoxProps["sx"];
}> = ({
  closedMultiEntityTypesMap,
  closedMultiEntityTypesDefinitions,
  endAdornment,
  entity,
  label,
  onEntityClick,
  openInNew,
  subgraph,
  sx,
}) => {
  const entityLabel = useMemo(() => {
    if (!entity) {
      return "Hidden entity";
    }

    if (closedMultiEntityTypesMap) {
      const closedEntityType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesMap,
        entity.metadata.entityTypeIds,
      );

      return generateEntityLabel(closedEntityType, entity);
    }

    return generateEntityLabel(subgraph, entity);
  }, [closedMultiEntityTypesMap, subgraph, entity]);

  const entityIcon = useMemo(() => {
    if (!entity) {
      return undefined;
    }

    if (closedMultiEntityTypesMap) {
      const closedEntityType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesMap,
        entity.metadata.entityTypeIds,
      );

      const { icon } = getDisplayFieldsForClosedEntityType(closedEntityType);
      return icon;
    }

    for (const entityTypeId of entity.metadata.entityTypeIds) {
      const entityType = getEntityTypeById(subgraph, entityTypeId);

      if (!entityType) {
        throw new Error(`Entity type not found: ${entityTypeId}`);
      }

      if (entityType.schema.icon) {
        return entityType.schema.icon;
      }
    }
  }, [closedMultiEntityTypesMap, entity, subgraph]);

  const getOwnerForEntity = useGetOwnerForEntity();

  const href = useMemo(() => {
    if (!entity || entity.metadata.recordId.entityId.includes("draft")) {
      return undefined;
    }

    const { shortname: entityNamespace } = getOwnerForEntity({
      entityId: entity.metadata.recordId.entityId,
    });

    return `/@${entityNamespace}/entities/${extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    )}`;
  }, [getOwnerForEntity, entity]);

  const content = (
    <Box
      display="flex"
      alignItems="center"
      columnGap={1}
      paddingX={1.5}
      paddingY={0.75}
      sx={[
        {
          background: ({ palette }) => palette.common.white,
          borderRadius: "6px",
          borderColor: ({ palette }) => palette.gray[30],
          borderWidth: 1,
          borderStyle: "solid",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          display: "flex",
          svg: {
            color: ({ palette }) => palette.gray[50],
            transition: ({ transitions }) => transitions.create("color"),
          },
        }}
      >
        {entity ? (
          <EntityOrTypeIcon
            entity={entity}
            fontSize={12}
            icon={entityIcon}
            isLink={!!entity.linkData}
            fill={({ palette }) => palette.gray[50]}
          />
        ) : (
          <EyeSlashRegularIcon sx={{ fontSize: 14 }} />
        )}
      </Box>
      <ContentTypography>{entityLabel}</ContentTypography>
      {endAdornment}
    </Box>
  );

  const contentWithLink = href ? (
    <Link
      onClick={(event) => {
        if (onEntityClick && entity) {
          event.preventDefault();
          onEntityClick(entity.metadata.recordId.entityId);
        }
      }}
      openInNew={openInNew}
      href={href}
      noLinkStyle
      sx={{
        "&:hover": {
          [`.${typographyClasses.root}, svg`]: {
            color: ({ palette }) => palette.blue[70],
          },
        },
      }}
    >
      {content}
    </Link>
  ) : (
    content
  );

  const entityProperties = useMemo(() => {
    if (!entity) {
      return undefined;
    }

    return typedEntries(entity.properties).flatMap(
      ([baseUrl, propertyValue]) => {
        const closedEntityType = closedMultiEntityTypesMap
          ? getClosedMultiEntityTypeFromMap(
              closedMultiEntityTypesMap,
              entity.metadata.entityTypeIds,
            )
          : null;

        const propertyType =
          closedEntityType && closedMultiEntityTypesDefinitions
            ? getPropertyTypeForClosedMultiEntityType(
                closedEntityType,
                baseUrl,
                closedMultiEntityTypesDefinitions,
              )
            : getPropertyTypeForEntity(
                subgraph,
                entity.metadata.entityTypeIds,
                baseUrl,
              ).propertyType;

        const stringifiedPropertyValue =
          stringifyEntityPropertyValue(propertyValue);

        return {
          propertyType,
          stringifiedPropertyValue,
        };
      },
    );
  }, [
    closedMultiEntityTypesMap,
    closedMultiEntityTypesDefinitions,
    entity,
    subgraph,
  ]);

  const outgoingLinkTypesAndTargetEntities = useMemo(() => {
    if (!entity) {
      return undefined;
    }

    const outgoingLinksByLinkEntityType = getOutgoingLinkAndTargetEntities(
      subgraph,
      entity.metadata.recordId.entityId,
    ).reduce<{
      [linkEntityTypeId: string]: {
        linkEntityType: EntityTypeWithMetadata;
        rightEntities: Entity[];
      };
    }>(
      (
        prev,
        {
          linkEntity: linkEntityRevisions,
          rightEntity: rightEntityRevisions = [],
        },
      ) => {
        const linkEntity = linkEntityRevisions[0];
        const rightEntity = rightEntityRevisions[0];

        if (!linkEntity || !rightEntity) {
          return prev;
        }

        const linkEntityTypeId = linkEntity.metadata.entityTypeIds[0];
        const linkEntityType = getEntityTypeById(subgraph, linkEntityTypeId);

        if (!linkEntityType) {
          return prev;
        }

        if (prev[linkEntityTypeId]) {
          const targetAlreadyPresent = prev[
            linkEntityTypeId
          ].rightEntities.some(
            (existingRightEntity) =>
              existingRightEntity.metadata.recordId.entityId ===
              rightEntity.metadata.recordId.entityId,
          );

          if (targetAlreadyPresent) {
            return prev;
          }

          return {
            ...prev,
            [linkEntityTypeId]: {
              linkEntityType,
              rightEntities: [
                ...prev[linkEntityTypeId].rightEntities,
                rightEntity,
              ],
            },
          };
        }

        return {
          ...prev,
          [linkEntityTypeId]: {
            linkEntityType,
            rightEntities: [rightEntity],
          },
        };
      },
      {},
    );

    return Object.values(outgoingLinksByLinkEntityType);
  }, [entity, subgraph]);

  const theme = useTheme();

  const tooltipContent =
    (entityProperties && entityProperties.length > 0) ||
    (outgoingLinkTypesAndTargetEntities &&
      outgoingLinkTypesAndTargetEntities.length > 0) ? (
      <Box>
        {[
          ...(entityProperties ?? []),
          ...(outgoingLinkTypesAndTargetEntities ?? []),
        ]
          .sort((a, b) => {
            const aTitle =
              "propertyType" in a
                ? a.propertyType.title
                : a.linkEntityType.schema.title;

            const bTitle =
              "propertyType" in b
                ? b.propertyType.title
                : b.linkEntityType.schema.title;

            return aTitle.localeCompare(bTitle);
          })
          .map((propertyOrOutgoingLink) => (
            <Typography
              component="div"
              key={
                "propertyType" in propertyOrOutgoingLink
                  ? propertyOrOutgoingLink.propertyType.$id
                  : propertyOrOutgoingLink.linkEntityType.schema.$id
              }
              sx={{
                marginBottom: 0.5,
                py: 0.5,
              }}
            >
              <Typography
                component="div"
                sx={{
                  color: ({ palette }) => palette.gray[30],
                  letterSpacing: 0,
                  fontSize: 11,
                  mb: 0.5,
                }}
                variant="smallCaps"
              >
                {"propertyType" in propertyOrOutgoingLink
                  ? propertyOrOutgoingLink.propertyType.title
                  : `${propertyOrOutgoingLink.linkEntityType.schema.title} ${propertyOrOutgoingLink.rightEntities.length}`}
              </Typography>{" "}
              {"propertyType" in propertyOrOutgoingLink ? (
                <Typography
                  sx={{
                    color: ({ palette }) => palette.common.white,
                    fontSize: 12,
                    lineHeight: 1.3,
                  }}
                >
                  {propertyOrOutgoingLink.stringifiedPropertyValue}
                </Typography>
              ) : (
                <Stack
                  direction="row"
                  columnGap={0.5}
                  rowGap={0.5}
                  flexWrap="wrap"
                >
                  {propertyOrOutgoingLink.rightEntities.map((rightEntity) => {
                    const rightEntityLabel = generateEntityLabel(
                      subgraph,
                      rightEntity,
                    );

                    /**
                     * @todo H-3363 account for inheritance here (query for closed schema)
                     */
                    const rightEntityEntityType = getEntityTypeById(
                      subgraph,
                      rightEntity.metadata.entityTypeIds[0],
                    );

                    return (
                      <TooltipChip
                        label={rightEntityLabel}
                        icon={
                          <EntityOrTypeIcon
                            entity={rightEntity}
                            fill={theme.palette.gray[50]}
                            fontSize={11}
                            icon={rightEntityEntityType?.schema.icon}
                            isLink={!!rightEntity.linkData}
                          />
                        }
                        key={rightEntity.metadata.recordId.entityId}
                        onClick={() =>
                          onEntityClick?.(
                            rightEntity.metadata.recordId.entityId,
                          )
                        }
                      />
                    );
                  })}
                </Stack>
              )}
            </Typography>
          ))}
      </Box>
    ) : null;

  const contentWithLinkAndTooltip = tooltipContent ? (
    <Tooltip
      title={tooltipContent}
      slotProps={{
        tooltip: { sx: { maxHeight: 300, overflowY: "auto" } },
      }}
      placement="bottom-start"
    >
      {contentWithLink}
    </Tooltip>
  ) : (
    contentWithLink
  );

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{
        minWidth: 0,
        "&:first-of-type > a > div, &:first-of-type > div": {
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        },
        "&:last-of-type > a > div, &:last-of-type > div": {
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        },
        maxWidth: "60%",
      }}
    >
      {label ? (
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[80],
            fontSize: 11,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 0.5,
          }}
        >
          {label}
        </Typography>
      ) : null}
      {contentWithLinkAndTooltip}
    </Box>
  );
};

const LinkTypeInner = ({
  amongMultipleTypes,
  linkEntityType,
  clickable,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  elementRef,
}: {
  amongMultipleTypes: boolean;
  linkEntityType: Pick<EntityType, "$id" | "title" | "icon">;
  elementRef: HTMLDivElement;
  clickable: boolean;
}) => (
  <Box
    ref={(el) => {
      // eslint-disable-next-line no-param-reassign
      elementRef = el as HTMLDivElement;
    }}
    sx={{
      "&:hover": clickable
        ? {
            [`.${typographyClasses.root}, svg`]: {
              color: ({ palette }) => palette.blue[70],
            },
          }
        : {},
      background: ({ palette }) =>
        amongMultipleTypes ? palette.common.white : palette.gray[5],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
      paddingX: 1.5,
      paddingY: 0.75,
      borderColor: ({ palette }) => palette.gray[30],
      borderWidth: 1,
      borderStyle: "solid",
      borderLeftWidth: amongMultipleTypes ? 1 : 0,
      borderRightWidth: amongMultipleTypes ? 1 : 0,
    }}
  >
    <Box display="flex">
      <EntityOrTypeIcon
        entity={null}
        fontSize={13}
        isLink
        fill={({ palette }) => palette.blue[70]}
        icon={linkEntityType.icon}
      />
    </Box>
    <ContentTypography>
      {linkEntityType.title}
      <Box
        component="span"
        sx={{
          color: ({ palette }) => palette.gray[50],
          fontSize: 11,
          fontWeight: 400,
          ml: 0.5,
        }}
      >
        v{extractVersion(linkEntityType.$id)}
      </Box>
    </ContentTypography>
  </Box>
);

export const LinkLabelWithSourceAndDestination: FunctionComponent<{
  closedMultiEntityTypesMap: ClosedMultiEntityTypesRootMap | null;
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions | null;
  displayLabels?: boolean;
  leftEntityEndAdornment?: ReactNode;
  leftEntitySx?: BoxProps["sx"];
  linkEntity: LinkEntity;
  onEntityClick?: (entityId: EntityId) => void;
  openInNew?: boolean;
  rightEntityEndAdornment?: ReactNode;
  rightEntitySx?: BoxProps["sx"];
  subgraph: Subgraph<EntityRootType>;
  sx?: BoxProps["sx"];
}> = ({
  closedMultiEntityTypesMap,
  closedMultiEntityTypesDefinitions,
  displayLabels = false,
  leftEntityEndAdornment,
  leftEntitySx,
  linkEntity,
  onEntityClick,
  openInNew = false,
  rightEntityEndAdornment,
  rightEntitySx,
  subgraph,
  sx,
}) => {
  const { onTypeClick } = useEntityEditor();

  const { leftEntity, rightEntity, linkEntityTypes } = useMemo(() => {
    return {
      linkEntityTypes: closedMultiEntityTypesMap
        ? getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypesMap,
            linkEntity.metadata.entityTypeIds,
          ).allOf.map((entityType) => {
            const { icon } = getDisplayFieldsForClosedEntityType(entityType);

            return {
              $id: entityType.$id,
              title: entityType.title,
              icon,
            };
          })
        : linkEntity.metadata.entityTypeIds.map((entityTypeId) => {
            const entityType = getEntityTypeById(subgraph, entityTypeId);
            if (!entityType) {
              throw new Error(`Entity type not found: ${entityTypeId}`);
            }
            return entityType.schema;
          }),
      leftEntity: getEntityRevision(subgraph, linkEntity.linkData.leftEntityId),
      rightEntity: getEntityRevision(
        subgraph,
        linkEntity.linkData.rightEntityId,
      ),
    };
  }, [closedMultiEntityTypesMap, linkEntity, subgraph]);

  /**
   * If there are multiple link entity types for this link entity,
   * we want to draw lines from the left/right entity to each of the link types in the middle.
   * Something like this:
   *
   *                 +-----------+
   *                 |  Link     |
   *                /|  Type 1   |\
   * +-----------+ / +-----------+ \ +-----------+
   * |           |/                 \|           |
   * |   Left    |                   |   Right   |
   * |           |\                 /|           |
   * +-----------+ \ +-----------+ / +-----------+
   *                \|  Link     |/
   *                 |  Type 2   |
   *                 +-----------+
   *
   * Otherwise, the left/link/right entities are drawn in a straight line:
   * +-----------++---------++-----------+
   * |           |           |           |
   * |   Left    | Link Type |   Right   |
   * |           |           |           |
   * +-----------++---------++-----------+
   *
   * We need these refs to draw the lines connecting the entities to the link types.
   */
  const linkTypeRefs = useRef<HTMLDivElement[]>([]);
  const leftEntityRef = useRef<HTMLDivElement>(null);
  const rightEntityRef = useRef<HTMLDivElement>(null);

  return (
    <Stack
      alignItems="center"
      direction="row"
      sx={[
        {
          width: "fit-content",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <LeftOrRightEntity
        closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
        closedMultiEntityTypesMap={closedMultiEntityTypesMap}
        entity={leftEntity}
        subgraph={subgraph}
        endAdornment={leftEntityEndAdornment}
        onEntityClick={onEntityClick}
        openInNew={openInNew}
        label={displayLabels ? "Source entity" : undefined}
        sx={leftEntitySx}
      />
      <Stack
        gap={2}
        sx={{
          position: "relative",
          paddingX: linkEntityTypes.length > 1 ? 2 : 0,
        }}
      >
        {linkEntityTypes.map((linkEntityType, index) => (
          <Fragment key={linkEntityType.$id}>
            <Link
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTypeClick("entityType", linkEntityType.$id);
              }}
              openInNew={openInNew}
              href={generateLinkParameters(linkEntityType.$id).href}
              noLinkStyle
            >
              <LinkTypeInner
                amongMultipleTypes={linkEntityTypes.length > 1}
                clickable
                linkEntityType={linkEntityType}
                elementRef={linkTypeRefs.current[index]!}
              />
            </Link>
            {linkEntityTypes.length > 0 && linkTypeRefs.current[index] && (
              /**
               * In cases where we have multiple link entity types, draw a line from:
               * 1. The left edge of the link entity type to the right edge of the left entity
               * 2. The right edge of the link entity type to the left edge of the right entity
               *
               * See diagram above.
               */
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                  width: "100%",
                  height: "100%",
                }}
              >
                {(() => {
                  // Get bounding rect of the outermost Stack of this component
                  const containerRect =
                    linkTypeRefs.current[
                      index
                    ].parentElement!.parentElement!.getBoundingClientRect();

                  const leftEntityRect =
                    leftEntityRef.current?.getBoundingClientRect();
                  const rightEntityRect =
                    rightEntityRef.current?.getBoundingClientRect();
                  const linkEntityRect =
                    linkTypeRefs.current[index].getBoundingClientRect();

                  if (!leftEntityRect || !rightEntityRect) {
                    return null;
                  }

                  // Calculate coordinates relative to the container for the origin and target of each line
                  const leftEntityRightCenter = {
                    x: leftEntityRect.right - containerRect.left,
                    y:
                      leftEntityRect.top +
                      leftEntityRect.height / 2 -
                      containerRect.top,
                  };

                  const linkEntityLeftCenter = {
                    x: linkEntityRect.left - containerRect.left,
                    y:
                      linkEntityRect.top +
                      linkEntityRect.height / 2 -
                      containerRect.top,
                  };

                  const rightEntityLeftCenter = {
                    x: rightEntityRect.left - containerRect.left,
                    y:
                      rightEntityRect.top +
                      rightEntityRect.height / 2 -
                      containerRect.top,
                  };

                  const linkEntityRightCenter = {
                    x: linkEntityRect.right - containerRect.left,
                    y:
                      linkEntityRect.top +
                      linkEntityRect.height / 2 -
                      containerRect.top,
                  };

                  return (
                    <>
                      <Box
                        component="line"
                        x1={leftEntityRightCenter.x}
                        y1={leftEntityRightCenter.y}
                        x2={linkEntityLeftCenter.x}
                        y2={linkEntityLeftCenter.y}
                        strokeWidth="1"
                        sx={{ stroke: ({ palette }) => palette.gray[40] }}
                      />
                      <Box
                        component="line"
                        x1={rightEntityLeftCenter.x}
                        y1={rightEntityLeftCenter.y}
                        x2={linkEntityRightCenter.x}
                        y2={linkEntityRightCenter.y}
                        strokeWidth="1"
                        sx={{ stroke: ({ palette }) => palette.gray[40] }}
                      />
                    </>
                  );
                })()}
              </svg>
            )}
          </Fragment>
        ))}
      </Stack>
      <LeftOrRightEntity
        closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
        closedMultiEntityTypesMap={closedMultiEntityTypesMap}
        entity={rightEntity}
        onEntityClick={onEntityClick}
        subgraph={subgraph}
        endAdornment={rightEntityEndAdornment}
        sx={rightEntitySx}
        openInNew={openInNew}
        label={displayLabels ? "Target entity" : undefined}
      />
    </Stack>
  );
};
