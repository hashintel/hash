import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Popover, styled, Tooltip, Typography } from "@mui/material";
import { FunctionComponent, useMemo, useRef, useState } from "react";

import { useEntityById } from "../../../../components/hooks/use-entity-by-id";
import { generateEntityLabel } from "../../../../lib/entities";
import { constructPageRelativeUrl } from "../../../../lib/routes";
import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { ArrowUpRightRegularIcon } from "../../../../shared/icons/arrow-up-right-regular-icon";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { Link } from "../../../../shared/ui";
import { useEntityIcon } from "../../../../shared/use-entity-icon";
import { useUserOrOrg } from "../../../../shared/use-user-or-org";
import { Mention } from "../shared/mention-suggester";

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
  const { entitySubgraph, loading } = useEntityById({
    entityId,
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      isOfType: { outgoing: 1 },
      hasLeftEntity: { incoming: 1, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 1 },
    },
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const { propertyTypes } = usePropertyTypes({ latestOnly: true });
  const { entityTypes } = useEntityTypesContextRequired();

  const [popoverOpen, setPopoverOpen] = useState(false);

  const entity = useMemo(
    () => (entitySubgraph ? getRoots(entitySubgraph)[0] : undefined),
    [entitySubgraph],
  );

  const entityLabel = useMemo(
    () => (entitySubgraph ? generateEntityLabel(entitySubgraph) : undefined),
    [entitySubgraph],
  );

  const entityOwnedById = useMemo(
    () =>
      entity
        ? extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId)
        : undefined,
    [entity],
  );

  const { userOrOrg: owner } = useUserOrOrg({
    accountOrAccountGroupId: entityOwnedById,
  });

  const entityOwnerShortname = useMemo(() => {
    if (owner) {
      const { shortname } = simplifyProperties(owner.properties);
      return shortname ?? "incomplete-user-profile";
    }
  }, [owner]);

  const entityHref = useMemo(() => {
    if (entity && entityOwnerShortname) {
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
          linkEntityRevisions[0] &&
          extractBaseUrl(linkEntityRevisions[0].metadata.entityTypeId) ===
            mention.linkEntityTypeBaseUrl,
      );

      const targetEntity = outgoingLinkAndTargetEntities?.rightEntity[0];

      const targetEntityLabel = generateEntityLabel(
        entitySubgraph,
        targetEntity,
      );

      return targetEntityLabel;
    } else {
      const propertyTypeBaseUrl = mention.propertyTypeBaseUrl;

      const propertyValue = entity?.properties[propertyTypeBaseUrl];

      return propertyValue?.toString();
    }
  }, [mention, entityId, entitySubgraph, entity, entityLabel]);

  const href = useMemo(() => {
    if (entity) {
      if (mention.kind === "user" || mention.kind === "entity") {
        if (
          entity.metadata.entityTypeId ===
            systemTypes.entityType.user.entityTypeId ||
          entity.metadata.entityTypeId ===
            systemTypes.entityType.org.entityTypeId
        ) {
          const shortname =
            entity.properties[
              extractBaseUrl(systemTypes.propertyType.shortname.propertyTypeId)
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

  const entityIcon = useEntityIcon({ entity });

  const propertyType = useMemo(() => {
    if (mention.kind === "property-value" && propertyTypes) {
      const { propertyTypeBaseUrl } = mention;

      /**
       * @todo: use the version of the property type that's
       * referenced in the source entity type schema instead
       */

      return Object.values(propertyTypes).find(
        ({ metadata }) => metadata.recordId.baseUrl === propertyTypeBaseUrl,
      );
    }
  }, [mention, propertyTypes]);

  const outgoingLinkType = useMemo(() => {
    if (mention.kind === "outgoing-link" && entityTypes) {
      const { linkEntityTypeBaseUrl } = mention;

      /**
       * @todo: use the version of the link entity type that's referenced
       * in the source entity type schema instead
       */

      return entityTypes.find(
        ({ metadata }) => metadata.recordId.baseUrl === linkEntityTypeBaseUrl,
      );
    }
  }, [mention, entityTypes]);

  const hasPopover =
    mention.kind === "property-value" || mention.kind === "outgoing-link";

  const hasTooltip =
    mention.kind === "property-value" || mention.kind === "outgoing-link";

  const chip = (
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
          {["user", "page", "entity"].includes(mention.kind) ? (
            <Box component="span" marginRight={0.5}>
              {entityIcon}
            </Box>
          ) : null}
          {title}
        </>
      )}
    </Box>
  );

  const content = (
    <>
      {hasTooltip ? (
        <Tooltip
          PopperProps={{
            modifiers: [
              {
                name: "offset",
                options: {
                  offset: [0, -5],
                },
              },
            ],
          }}
          title={
            <>
              {mention.kind === "property-value"
                ? propertyType?.schema.title
                : outgoingLinkType?.schema.title}{" "}
              of {entityLabel}
            </>
          }
          placement="bottom-start"
        >
          {chip}
        </Tooltip>
      ) : (
        chip
      )}
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
