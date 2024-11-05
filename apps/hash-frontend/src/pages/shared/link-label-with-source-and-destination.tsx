import type { EntityPropertyValue } from "@blockprotocol/graph";
import {
  EntityOrTypeIcon,
  EyeSlashIconRegular,
} from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";
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
import { LinkRegularIcon } from "../../shared/icons/link-regular-icon";
import { Link } from "../../shared/ui";
import { useEntityEditor } from "../[shortname]/entities/[entity-uuid].page/entity-editor/entity-editor-context";
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

const stringifyEntityPropertyValue = (value: EntityPropertyValue): string => {
  if (Array.isArray(value)) {
    return value.map(stringifyEntityPropertyValue).join(", ");
  } else if (typeof value === "boolean") {
    return value ? "True" : "False";
  } else if (typeof value === "undefined") {
    return "Undefined";
  } else {
    return String(value);
  }
};

const LeftOrRightEntity: FunctionComponent<{
  entity?: Entity;
  onEntityClick?: (entityId: EntityId) => void;
  subgraph: Subgraph<EntityRootType>;
  openInNew?: boolean;
  endAdornment?: ReactNode;
  label?: ReactNode;
  sx?: BoxProps["sx"];
}> = ({
  subgraph,
  entity,
  endAdornment,
  onEntityClick,
  sx,
  label,
  openInNew,
}) => {
  const entityLabel = useMemo(
    () => (entity ? generateEntityLabel(subgraph, entity) : "Hidden entity"),
    [subgraph, entity],
  );

  const entityTypes = useMemo(() => {
    if (!entity) {
      return undefined;
    }

    return entity.metadata.entityTypeIds.map((entityTypeId) => {
      const entityType = getEntityTypeById(subgraph, entityTypeId);
      if (!entityType) {
        throw new Error(`Entity type not found: ${entityTypeId}`);
      }
      return entityType;
    });
  }, [entity, subgraph]);

  /**
   * @todo H-3363 account for multitype and inheritance here (use closed schema)
   */
  const firstTypeIcon = entityTypes?.find((type) => type.schema.icon)?.schema
    .icon;

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
            icon={firstTypeIcon}
          />
        ) : (
          <EyeSlashIconRegular sx={{ fontSize: 14 }} />
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

    return typedEntries(entity.properties)
      .map(([baseUrl, propertyValue]) => {
        const propertyType = getPropertyTypeForEntity(
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
      })
      .flat();
  }, [entity, subgraph]);

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
                            fill={theme.palette.gray[30]}
                            fontSize={11}
                            icon={rightEntityEntityType?.schema.icon}
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  elementRef,
}: {
  amongMultipleTypes: boolean;
  linkEntityType: EntityTypeWithMetadata;
  elementRef: HTMLDivElement;
}) => (
  <Box
    ref={(el) => {
      // eslint-disable-next-line no-param-reassign
      elementRef = el as HTMLDivElement;
    }}
    sx={{
      "&:hover": {
        [`.${typographyClasses.root}, svg`]: {
          color: ({ palette }) => palette.blue[70],
        },
      },
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
      {/* @todo H-3363 account for inherited icons, and SVG URL icons */}
      {linkEntityType.schema.icon ?? (
        <LinkRegularIcon
          sx={{
            color: ({ palette }) => palette.common.black,
            fontSize: 16,
            transition: ({ transitions }) => transitions.create("color"),
          }}
        />
      )}
    </Box>
    <ContentTypography>
      {linkEntityType.schema.title}
      <Box
        component="span"
        sx={{
          color: ({ palette }) => palette.gray[50],
          fontSize: 11,
          fontWeight: 400,
          ml: 0.5,
        }}
      >
        v{linkEntityType.metadata.recordId.version}
      </Box>
    </ContentTypography>
  </Box>
);

export const LinkLabelWithSourceAndDestination: FunctionComponent<{
  linkEntity: LinkEntity;
  subgraph: Subgraph<EntityRootType>;
  leftEntityEndAdornment?: ReactNode;
  rightEntityEndAdornment?: ReactNode;
  sx?: BoxProps["sx"];
  leftEntitySx?: BoxProps["sx"];
  rightEntitySx?: BoxProps["sx"];
  displayLabels?: boolean;
  onEntityClick?: (entityId: EntityId) => void;
  openInNew?: boolean;
}> = ({
  linkEntity,
  subgraph,
  leftEntityEndAdornment,
  rightEntityEndAdornment,
  sx,
  leftEntitySx,
  rightEntitySx,
  displayLabels = false,
  onEntityClick,
  openInNew = false,
}) => {
  const { disableTypeClick } = useEntityEditor();

  const { leftEntity, rightEntity, linkEntityTypes } = useMemo(() => {
    return {
      linkEntityTypes: linkEntity.metadata.entityTypeIds.map((entityTypeId) => {
        const entityType = getEntityTypeById(subgraph, entityTypeId);
        if (!entityType) {
          throw new Error(`Entity type not found: ${entityTypeId}`);
        }
        return entityType;
      }),
      leftEntity: getEntityRevision(subgraph, linkEntity.linkData.leftEntityId),
      rightEntity: getEntityRevision(
        subgraph,
        linkEntity.linkData.rightEntityId,
      ),
    };
  }, [linkEntity, subgraph]);

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
          <Fragment key={linkEntityType.schema.$id}>
            {disableTypeClick ? (
              <Box>
                <LinkTypeInner
                  amongMultipleTypes={linkEntityTypes.length > 1}
                  linkEntityType={linkEntityType}
                  elementRef={linkTypeRefs.current[index]!}
                />
              </Box>
            ) : (
              <Link
                openInNew={openInNew}
                href={generateLinkParameters(linkEntityType.schema.$id).href}
                noLinkStyle
              >
                <LinkTypeInner
                  amongMultipleTypes={linkEntityTypes.length > 1}
                  linkEntityType={linkEntityType}
                  elementRef={linkTypeRefs.current[index]!}
                />
              </Link>
            )}
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
