import type { EntityPropertyValue } from "@blockprotocol/graph";
import {
  AsteriskRegularIcon,
  Chip,
  EyeSlashIconRegular,
} from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
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
  chipClasses,
  Stack,
  styled,
  Tooltip,
  Typography,
  typographyClasses,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { forwardRef, Fragment, useMemo, useRef } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { LinkRegularIcon } from "../../shared/icons/link-regular-icon";
import { Link } from "../../shared/ui";
import { useEntityIcon } from "../../shared/use-entity-icon";

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

const LeftOrRightEntity = forwardRef<
  HTMLDivElement,
  {
    entity?: Entity;
    subgraph: Subgraph<EntityRootType>;
    openInNew?: boolean;
    endAdornment?: ReactNode;
    label?: ReactNode;
    sx?: BoxProps["sx"];
  }
>(({ subgraph, entity, endAdornment, sx, label, openInNew }, ref) => {
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

  const icon = useEntityIcon({ entity, entityTypes });

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
      ref={ref}
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
            fontSize: 16,
            transition: ({ transitions }) => transitions.create("color"),
          },
        }}
      >
        {entity ? (icon ?? <AsteriskRegularIcon />) : <EyeSlashIconRegular />}
      </Box>
      <ContentTypography>{entityLabel}</ContentTypography>
      {endAdornment}
    </Box>
  );

  const contentWithLink = href ? (
    <Link
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

  const outgoingLinksByLinkEntityType = useMemo(() => {
    if (!entity) {
      return undefined;
    }

    return getOutgoingLinkAndTargetEntities(
      subgraph,
      entity.metadata.recordId.entityId,
    ).reduce<
      {
        linkEntityType: EntityTypeWithMetadata;
        rightEntities: Entity[];
      }[]
    >(
      (
        prev,
        {
          linkEntity: linkEntityRevisions,
          /**
           * @todo: figure out why this is typed as non-nullable when
           * it can be nullable.
           */
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

        const linkEntityTypeIndex = prev.findIndex(
          (grouping) =>
            grouping.linkEntityType.schema.$id === linkEntityType.schema.$id,
        );

        return linkEntityTypeIndex < 0
          ? [
              ...prev,
              {
                linkEntityType,
                rightEntities: [rightEntity],
              },
            ]
          : [
              ...prev.slice(0, linkEntityTypeIndex),
              {
                linkEntityType,
                rightEntities: [
                  ...prev[linkEntityTypeIndex]!.rightEntities,
                  rightEntity,
                ],
              },
              ...prev.slice(linkEntityTypeIndex + 1),
            ];
      },
      [],
    );
  }, [entity, subgraph]);

  const tooltipContent =
    (entityProperties && entityProperties.length > 0) ||
    (outgoingLinksByLinkEntityType &&
      outgoingLinksByLinkEntityType.length > 0) ? (
      <Box>
        {[...(entityProperties ?? []), ...(outgoingLinksByLinkEntityType ?? [])]
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
              key={
                "propertyType" in propertyOrOutgoingLink
                  ? propertyOrOutgoingLink.propertyType.$id
                  : propertyOrOutgoingLink.linkEntityType.schema.$id
              }
              sx={{
                color: ({ palette }) => palette.common.white,
                marginBottom: 0.5,
              }}
            >
              <strong>
                {"propertyType" in propertyOrOutgoingLink
                  ? propertyOrOutgoingLink.propertyType.title
                  : propertyOrOutgoingLink.linkEntityType.schema.title}
                :
              </strong>{" "}
              {"propertyType" in propertyOrOutgoingLink
                ? propertyOrOutgoingLink.stringifiedPropertyValue
                : propertyOrOutgoingLink.rightEntities.map((rightEntity) => {
                    const rightEntityLabel = generateEntityLabel(
                      subgraph,
                      rightEntity,
                    );

                    return (
                      <Chip
                        key={rightEntity.metadata.recordId.entityId}
                        label={rightEntityLabel}
                        sx={{
                          borderColor: ({ palette }) => palette.gray[30],
                          [`.${chipClasses.label}`]: {
                            paddingY: 0.25,
                          },
                          "&:not(:last-of-type)": {
                            marginRight: 1,
                          },
                        }}
                      />
                    );
                  })}
            </Typography>
          ))}
      </Box>
    ) : null;

  const contentWithLinkAndTooltip = tooltipContent ? (
    <Tooltip title={tooltipContent} placement="bottom-start">
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
});

export const LinkLabelWithSourceAndDestination: FunctionComponent<{
  linkEntity: LinkEntity;
  subgraph: Subgraph<EntityRootType>;
  leftEntityEndAdornment?: ReactNode;
  rightEntityEndAdornment?: ReactNode;
  sx?: BoxProps["sx"];
  leftEntitySx?: BoxProps["sx"];
  rightEntitySx?: BoxProps["sx"];
  displayLabels?: boolean;
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
  openInNew = false,
}) => {
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
        openInNew={openInNew}
        label={displayLabels ? "Source entity" : undefined}
        ref={leftEntityRef}
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
            <Link
              openInNew={openInNew}
              href={generateLinkParameters(linkEntityType.schema.$id).href}
              noLinkStyle
            >
              <Box
                ref={(el) => {
                  linkTypeRefs.current[index] = el as HTMLDivElement;
                }}
                sx={{
                  "&:hover": {
                    [`.${typographyClasses.root}, svg`]: {
                      color: ({ palette }) => palette.blue[70],
                    },
                  },
                  background: ({ palette }) =>
                    linkEntityTypes.length > 1
                      ? palette.common.white
                      : palette.gray[5],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  paddingX: 1.5,
                  paddingY: 0.75,
                  borderColor: ({ palette }) => palette.gray[30],
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderLeftWidth: linkEntityTypes.length > 1 ? 1 : 0,
                  borderRightWidth: linkEntityTypes.length > 1 ? 1 : 0,
                }}
              >
                <Box display="flex">
                  {linkEntityType.metadata.icon ?? (
                    <LinkRegularIcon
                      sx={{
                        color: ({ palette }) => palette.common.black,
                        fontSize: 16,
                        transition: ({ transitions }) =>
                          transitions.create("color"),
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
        entity={rightEntity}
        subgraph={subgraph}
        endAdornment={rightEntityEndAdornment}
        sx={rightEntitySx}
        openInNew={openInNew}
        ref={rightEntityRef}
        label={displayLabels ? "Target entity" : undefined}
      />
    </Stack>
  );
};
