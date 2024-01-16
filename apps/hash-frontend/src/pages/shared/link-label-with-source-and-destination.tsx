import { extractVersion } from "@blockprotocol/type-system";
import {
  AsteriskRegularIcon,
  EyeSlashIconRegular,
} from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityPropertyValue,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import {
  Box,
  BoxProps,
  styled,
  Tooltip,
  Typography,
  typographyClasses,
} from "@mui/material";
import { FunctionComponent, ReactNode, useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { LinkRegularIcon } from "../../shared/icons/link-regular-icon";
import { Link } from "../../shared/ui";

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
  subgraph: Subgraph<EntityRootType>;
  openInNew?: boolean;
  endAdornment?: ReactNode;
  label?: ReactNode;
  sx?: BoxProps["sx"];
}> = ({ subgraph, entity, endAdornment, sx, label, openInNew }) => {
  const entityLabel = useMemo(
    () => (entity ? generateEntityLabel(subgraph, entity) : "Hidden entity"),
    [subgraph, entity],
  );

  const entityType = useMemo(
    () =>
      entity
        ? getEntityTypeById(subgraph, entity.metadata.entityTypeId)
        : undefined,
    [subgraph, entity],
  );

  const getOwnerForEntity = useGetOwnerForEntity();

  const href = useMemo(() => {
    if (!entity || entity.metadata.recordId.entityId.includes("draft")) {
      return undefined;
    }

    const { shortname: entityNamespace } = getOwnerForEntity(entity);

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
            fontSize: 16,
            transition: ({ transitions }) => transitions.create("color"),
          },
        }}
      >
        {entityType ? (
          entityType.metadata.icon ?? <AsteriskRegularIcon />
        ) : (
          <EyeSlashIconRegular />
        )}
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
    if (!entity || !entityType) {
      return undefined;
    }

    return Object.entries(entity.properties)
      .map(([baseUrl, propertyValue]) => {
        const propertyTypeId = Object.values(entityType.schema.properties)
          .map((value) => ("items" in value ? value.items.$ref : value.$ref))
          .find((id) => extractBaseUrl(id) === baseUrl);

        if (!propertyTypeId) {
          return [];
        }

        const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

        if (!propertyType) {
          return [];
        }

        const stringifiedPropertyValue =
          stringifyEntityPropertyValue(propertyValue);

        return {
          propertyType,
          stringifiedPropertyValue,
        };
      })
      .flat();
  }, [entity, subgraph, entityType]);

  const tooltipContent =
    entityProperties && entityProperties.length > 0 ? (
      <Box>
        {entityProperties.map(({ propertyType, stringifiedPropertyValue }) => (
          <Typography
            key={propertyType.schema.$id}
            sx={{
              color: ({ palette }) => palette.common.white,
            }}
          >
            <strong>{propertyType.schema.title}:</strong>{" "}
            {stringifiedPropertyValue}
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
};

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
  const { leftEntity, rightEntity, linkEntityType } = useMemo(() => {
    return {
      linkEntityType: getEntityTypeById(
        subgraph,
        linkEntity.metadata.entityTypeId,
      )!,
      leftEntity: getEntityRevision(subgraph, linkEntity.linkData.leftEntityId),
      rightEntity: getEntityRevision(
        subgraph,
        linkEntity.linkData.rightEntityId,
      ),
    };
  }, [linkEntity, subgraph]);

  const linkEntityTypeVersion = useMemo(
    () => extractVersion(linkEntityType.schema.$id),
    [linkEntityType],
  );

  return (
    <Box
      sx={[
        {
          display: "flex",
          width: "fit-content",
          alignItems: "flex-end",
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
        sx={leftEntitySx}
      />
      <Link
        openInNew={openInNew}
        href={generateLinkParameters(linkEntityType.schema.$id).href}
        noLinkStyle
        sx={{
          "&:hover": {
            [`.${typographyClasses.root}, svg`]: {
              color: ({ palette }) => palette.blue[70],
            },
          },
        }}
      >
        <Box
          sx={{
            background: ({ palette }) => palette.gray[5],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            paddingX: 1.5,
            paddingY: 0.75,
            borderColor: ({ palette }) => palette.gray[30],
            borderWidth: 1,
            borderStyle: "solid",
            borderLeftWidth: 0,
            borderRightWidth: 0,
          }}
        >
          <Box display="flex">
            {linkEntityType.metadata.icon ?? (
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
            {linkEntityType.schema.title}{" "}
            <Box
              component="span"
              sx={{
                color: ({ palette }) => palette.gray[50],
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              v{linkEntityTypeVersion}
            </Box>
          </ContentTypography>
        </Box>
      </Link>
      <LeftOrRightEntity
        entity={rightEntity}
        subgraph={subgraph}
        endAdornment={rightEntityEndAdornment}
        sx={rightEntitySx}
        openInNew={openInNew}
        label={displayLabels ? "Target entity" : undefined}
      />
    </Box>
  );
};
