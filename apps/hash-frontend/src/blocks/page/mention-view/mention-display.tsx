import { AsteriskRegularIcon } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getPropertyTypeById,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Popover, styled, Typography } from "@mui/material";
import { FunctionComponent, useMemo, useRef, useState } from "react";

import { useEntityById } from "../../../components/hooks/use-entity-by-id";
import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import { generateEntityLabel } from "../../../lib/entities";
import { constructPageRelativeUrl } from "../../../lib/routes";
import { ArrowUpRightRegularIcon } from "../../../shared/icons/arrow-up-right-regular-icon";
import { FileRegularIcon } from "../../../shared/icons/file-regular-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { UsersRegularIcon } from "../../../shared/icons/users-regular-icon";
import { Link } from "../../../shared/ui";
import { Mention } from "../create-suggester/mention-suggester";

const entityIcons = {
  [types.entityType.user.entityTypeId]: <UserIcon sx={{ fontSize: 12 }} />,
  [types.entityType.org.entityTypeId]: (
    <UsersRegularIcon sx={{ fontSize: 14, position: "relative", top: 1 }} />
  ),
  [types.entityType.page.entityTypeId]: (
    <FileRegularIcon sx={{ fontSize: 12 }} />
  ),
} as const;

const LinkIcon = styled(ArrowUpRightRegularIcon)(({ theme }) => ({
  marginLeft: theme.spacing(1),
  fontSize: 16,
  color: theme.palette.blue[70],
}));

interface MentionDisplayProps {
  mention: Mention;
}

export const MentionDisplay: FunctionComponent<MentionDisplayProps> = ({
  mention,
}) => {
  const { entityId } = mention;
  const { entitySubgraph, loading } = useEntityById(entityId);
  const contentRef = useRef<HTMLDivElement>(null);

  const [popoverOpen, setPopoverOpen] = useState(false);

  const entity = useMemo(
    () => (entitySubgraph ? getRoots(entitySubgraph)[0] : undefined),
    [entitySubgraph],
  );

  const entityLabel = useMemo(
    () => (entitySubgraph ? generateEntityLabel(entitySubgraph) : undefined),
    [entitySubgraph],
  );

  const getOwnerForEntity = useGetOwnerForEntity();

  const entityOwnerShortname = useMemo(() => {
    if (entity) {
      const { shortname } = getOwnerForEntity(entity);

      return shortname;
    }
  }, [entity, getOwnerForEntity]);

  const entityHref = useMemo(() => {
    if (entity) {
      return `/@${entityOwnerShortname}/entities/${extractEntityUuidFromEntityId(
        entity.metadata.recordId.entityId,
      )}`;
    }
  }, [entity, entityOwnerShortname]);

  const title = useMemo(() => {
    if (!entitySubgraph) {
      return undefined;
    }

    if (
      mention.kind === "entity" ||
      mention.kind === "page" ||
      mention.kind === "user"
    ) {
      return entityLabel;
    } else if (mention.kind === "outgoing-link") {
      const outgoingLinkAndTargetEntities = getOutgoingLinkAndTargetEntities(
        entitySubgraph,
        entityId,
      ).find(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0]?.metadata.recordId.entityId ===
          mention.linkEntityId,
      );

      const targetEntity = outgoingLinkAndTargetEntities?.rightEntity[0];

      const targetEntityLabel = generateEntityLabel(
        entitySubgraph,
        targetEntity,
      );

      return targetEntityLabel;
    } else {
      const propertyTypeBaseUrl = extractBaseUrl(mention.propertyTypeId);

      const propertyValue = entity?.properties[propertyTypeBaseUrl];

      return propertyValue?.toString();
    }
  }, [mention, entityId, entitySubgraph, entity, entityLabel]);

  const href = useMemo(() => {
    if (entity) {
      if (mention.kind === "user" || mention.kind === "entity") {
        if (
          entity.metadata.entityTypeId === types.entityType.user.entityTypeId ||
          entity.metadata.entityTypeId === types.entityType.org.entityTypeId
        ) {
          const shortname =
            entity.properties[
              extractBaseUrl(types.propertyType.shortname.propertyTypeId)
            ];
          return `/@${shortname}`;
        }
        return entityHref;
      } else if (mention.kind === "page" && entityOwnerShortname) {
        const pageEntityUuid = extractEntityUuidFromEntityId(entityId);

        return constructPageRelativeUrl({
          workspaceShortname: entityOwnerShortname,
          pageEntityUuid,
        });
      }
    }
  }, [entity, entityId, mention.kind, entityOwnerShortname, entityHref]);

  const entityType = useMemo(
    () =>
      entitySubgraph && entity
        ? getEntityTypeById(entitySubgraph, entity.metadata.entityTypeId)
        : undefined,
    [entitySubgraph, entity],
  );

  const entityIcon = useMemo(() => {
    if (
      entity &&
      entityType &&
      ["user", "page", "entity"].includes(mention.kind)
    ) {
      if (entityType.schema.$id === types.entityType.page.entityTypeId) {
        const customPageIcon =
          entity.properties[
            extractBaseUrl(types.propertyType.icon.propertyTypeId)
          ];
        if (typeof customPageIcon === "string") {
          return customPageIcon;
        }
      }
      /**
       * @todo: use the entity type icon
       * @see https://linear.app/hash/issue/H-783/implement-entity-type-icons
       */
      return (
        entityIcons[entityType.schema.$id] ?? (
          <AsteriskRegularIcon sx={{ fontSize: 12 }} />
        )
      );
    }
  }, [mention, entityType, entity]);

  const propertyType = useMemo(
    () =>
      mention.kind === "property-value" && entitySubgraph
        ? getPropertyTypeById(entitySubgraph, mention.propertyTypeId)
        : undefined,
    [entitySubgraph, mention],
  );

  const outgoingLinkType = useMemo(() => {
    if (mention.kind === "outgoing-link" && entitySubgraph) {
      const linkEntity = getEntityRevision(
        entitySubgraph,
        mention.linkEntityId,
      );

      const linkEntityTypeId = linkEntity?.metadata.entityTypeId;

      const linkEntityType = linkEntityTypeId
        ? getEntityTypeById(entitySubgraph, linkEntityTypeId)
        : undefined;

      return linkEntityType;
    }
  }, [entitySubgraph, mention]);

  const hasPopover =
    mention.kind === "property-value" || mention.kind === "outgoing-link";

  const content = (
    <>
      <Box
        ref={contentRef}
        component="span"
        onClick={hasPopover ? () => setPopoverOpen(true) : undefined}
        sx={{
          borderRadius: "8px",
          background: ({ palette }) =>
            hasPopover && popoverOpen ? palette.blue[15] : palette.common.white,
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderWidth: 1,
          py: 0.25,
          px: 1,
          color: ({ palette }) => palette.gray[80],
          fontWeight: 500,
          ...(hasPopover
            ? {
                cursor: "pointer",
                "&:hover": {
                  background: ({ palette }) => palette.gray[10],
                },
              }
            : {}),
        }}
      >
        {loading ? (
          "Loading..."
        ) : (
          <>
            {entityIcon ? (
              <Box component="span" marginRight={0.5}>
                {entityIcon}
              </Box>
            ) : null}
            {title}
          </>
        )}
      </Box>
      {hasPopover ? (
        <Popover
          anchorEl={contentRef.current}
          open={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "left",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "left",
          }}
          PaperProps={{
            sx: {
              marginTop: 1,
              padding: 1,
              borderRadius: "4px",
              borderColor: ({ palette }) => palette.gray[15],
              borderStyle: "solid",
              borderWidth: 1,
            },
          }}
        >
          <Link
            href={entityType?.schema.$id ?? "#"}
            sx={{
              textDecoration: "none",
              "&:hover > p": {
                color: ({ palette }) => palette.blue[70],
              },
            }}
          >
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[90],
                fontWeight: 500,
                fontSize: 18,
              }}
            >
              {mention.kind === "property-value"
                ? propertyType?.schema.title
                : outgoingLinkType?.schema.title}
              <LinkIcon />
            </Typography>
          </Link>
          <Link
            href={entityHref ?? "#"}
            sx={{
              textDecoration: "none",
              "&:hover > p": {
                color: ({ palette }) => palette.blue[70],
              },
            }}
          >
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[70],
                fontWeight: 500,
                fontSize: 16,
              }}
            >
              {entityLabel}
              <LinkIcon />
            </Typography>
          </Link>
        </Popover>
      ) : null}
    </>
  );

  return href ? (
    <Link
      noLinkStyle
      href={href}
      sx={{
        "&:hover > span": { background: ({ palette }) => palette.gray[10] },
      }}
    >
      {content}
    </Link>
  ) : (
    content
  );
};
