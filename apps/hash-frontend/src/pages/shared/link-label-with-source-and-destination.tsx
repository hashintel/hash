import { extractVersion } from "@blockprotocol/type-system";
import { AsteriskRegularIcon } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { Box, styled, Typography, typographyClasses } from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { LinkRegularIcon } from "../../shared/icons/link-regular-icon";
import { Link } from "../../shared/ui";

const ContentTypography = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  color: theme.palette.common.black,
  fontWeight: 600,
  transition: theme.transitions.create("color"),
}));

const LeftOrRightEntity: FunctionComponent<{
  entity: Entity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ subgraph, entity }) => {
  const label = useMemo(
    () => generateEntityLabel(subgraph, entity),
    [subgraph, entity],
  );

  const entityType = useMemo(
    () => getEntityTypeById(subgraph, entity.metadata.entityTypeId)!,
    [subgraph, entity],
  );

  const getOwnerForEntity = useGetOwnerForEntity();

  const href = useMemo(() => {
    const { shortname: entityNamespace } = getOwnerForEntity(entity);

    return `/@${entityNamespace}/entities/${extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    )}`;
  }, [getOwnerForEntity, entity]);

  return (
    <Link
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
      <Box
        display="flex"
        alignItems="center"
        columnGap={1}
        paddingX={1.5}
        paddingY={0.75}
      >
        <Box display="flex">
          {entityType.metadata.icon ?? (
            <AsteriskRegularIcon
              sx={{
                color: ({ palette }) => palette.gray[50],
                fontSize: 16,
                transition: ({ transitions }) => transitions.create("color"),
              }}
            />
          )}
        </Box>
        <ContentTypography>{label}</ContentTypography>
      </Box>
    </Link>
  );
};

export const LinkLabelWithSourceAndDestination: FunctionComponent<{
  linkEntity: LinkEntity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ linkEntity, subgraph }) => {
  const { leftEntity, rightEntity, linkEntityType } = useMemo(() => {
    return {
      linkEntityType: getEntityTypeById(
        subgraph,
        linkEntity.metadata.entityTypeId,
      )!,
      leftEntity: getEntityRevision(
        subgraph,
        linkEntity.linkData.leftEntityId,
      )!,
      rightEntity: getEntityRevision(
        subgraph,
        linkEntity.linkData.rightEntityId,
      )!,
    };
  }, [linkEntity, subgraph]);

  const linkEntityTypeVersion = useMemo(
    () => extractVersion(linkEntityType.schema.$id),
    [linkEntityType],
  );

  return (
    <Box
      sx={{
        display: "flex",
        background: ({ palette }) => palette.common.white,
        width: "fit-content",
        borderRadius: "6px",
        borderColor: ({ palette }) => palette.gray[20],
        borderWidth: 1,
        borderStyle: "solid",
      }}
    >
      <LeftOrRightEntity entity={leftEntity} subgraph={subgraph} />
      <Link
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
            gap: 1,
            paddingX: 1.5,
            paddingY: 0.75,
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
      <LeftOrRightEntity entity={rightEntity} subgraph={subgraph} />
    </Box>
  );
};
