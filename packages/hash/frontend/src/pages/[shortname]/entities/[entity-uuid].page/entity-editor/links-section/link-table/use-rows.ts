import { VersionedUri } from "@hashintel/hash-subgraph";
import { getOutgoingLinkAndTargetEntitiesAtMoment } from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useMemo } from "react";

import { useBlockProtocolArchiveEntity } from "../../../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useSnackbar } from "../../../../../../../components/hooks/use-snackbar";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRows = () => {
  const { entitySubgraph, refetch } = useEntityEditor();
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const snackbar = useSnackbar();

  const rows = useMemo<LinkRow[]>(() => {
    const entity = getRoots(entitySubgraph)[0]!;
    const entityType = getEntityTypeById(
      entitySubgraph,
      entity.metadata.entityTypeId,
    );

    const outgoingLinkAndTargetEntitiesAtMoment =
      getOutgoingLinkAndTargetEntitiesAtMoment(
        entitySubgraph,
        entity.metadata.editionId.baseId,
        /** @todo - We probably want to use entity endTime - https://app.asana.com/0/1201095311341924/1203331904553375/f */
        new Date(),
      );

    const linkSchemas = entityType?.schema.links;

    if (!linkSchemas) {
      return [];
    }

    return Object.entries(linkSchemas).map<LinkRow>(([key, linkSchema]) => {
      const linkEntityTypeId = key as VersionedUri;

      const linkEntityType = getEntityTypeById(
        entitySubgraph,
        linkEntityTypeId,
      );

      if (!("oneOf" in linkSchema.items)) {
        throw new Error("oneOf not found inside linkSchema.items");
      }

      const linkAndTargetEntities =
        outgoingLinkAndTargetEntitiesAtMoment.filter(
          ({ linkEntity }) =>
            linkEntity.metadata.entityTypeId === linkEntityTypeId,
        );

      const expectedEntityTypes = linkSchema.items.oneOf.map(({ $ref }) => {
        const expectedEntityType = getEntityTypeById(entitySubgraph, $ref);

        if (!expectedEntityType) {
          throw new Error("entity type not found");
        }

        return expectedEntityType;
      });

      const expectedEntityTypeTitles = expectedEntityTypes.map((val) => {
        return val.schema.title;
      });

      return {
        rowId: linkEntityTypeId,
        linkEntityTypeId,
        linkTitle: linkEntityType?.schema.title ?? "",
        linkAndTargetEntities,
        maxItems: linkSchema.maxItems ?? 1,
        expectedEntityTypes,
        expectedEntityTypeTitles,
        entitySubgraph,
        deleteLink: async (linkEntityId) => {
          try {
            await archiveEntity({ data: { entityId: linkEntityId } });
            await refetch();
          } catch {
            snackbar.error("Failed to remove link");
          }
        },
      };
    });
  }, [entitySubgraph, archiveEntity, refetch, snackbar]);

  return rows;
};
