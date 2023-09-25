import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { useEntityById } from "../../../components/hooks/use-entity-by-id";
import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import { generateEntityLabel } from "../../../lib/entities";
import { constructPageRelativeUrl } from "../../../lib/routes";
import { Link } from "../../../shared/ui";
import { Mention } from "../create-suggester/mention-suggester";

interface MentionDisplayProps {
  mention: Mention;
}

export const MentionDisplay: FunctionComponent<MentionDisplayProps> = ({
  mention,
}) => {
  const { entityId } = mention;
  const { entitySubgraph } = useEntityById(entityId);

  const title = useMemo(() => {
    if (!entitySubgraph) {
      return undefined;
    }

    if (
      mention.kind === "entity" ||
      mention.kind === "page" ||
      mention.kind === "user"
    ) {
      return generateEntityLabel(entitySubgraph);
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
      const entity = getRoots(entitySubgraph)[0];

      const propertyValue = entity?.properties[mention.propertyBaseUrl];

      return propertyValue?.toString();
    }
  }, [mention, entityId, entitySubgraph]);

  const getOwnerForEntity = useGetOwnerForEntity();

  const href = useMemo(() => {
    const entity = entitySubgraph ? getRoots(entitySubgraph)[0] : undefined;

    if (entity) {
      const { shortname } = getOwnerForEntity(entity);

      if (mention.kind === "user" || mention.kind === "entity") {
        return `/@${shortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`;
      } else if (mention.kind === "page") {
        const pageEntityUuid = extractEntityUuidFromEntityId(entityId);

        return constructPageRelativeUrl({
          workspaceShortname: shortname,
          pageEntityUuid,
        });
      }
    }
  }, [entityId, mention.kind, entitySubgraph, getOwnerForEntity]);

  const content = (
    <Box
      component="span"
      sx={{
        borderRadius: "8px",
        background: ({ palette }) => palette.common.white,
        borderColor: ({ palette }) => palette.gray[30],
        borderStyle: "solid",
        borderWidth: 1,
        py: 0.25,
        px: 1,
        color: ({ palette }) => palette.gray[80],
        fontWeight: 500,
      }}
    >
      {title}
    </Box>
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
