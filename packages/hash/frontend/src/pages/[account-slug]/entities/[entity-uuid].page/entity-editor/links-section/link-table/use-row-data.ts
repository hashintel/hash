import { useMemo } from "react";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { getOutgoingLinkAndTargetEntitiesAtMoment } from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { generateEntityLabel } from "../../../../../../../lib/entities";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRowData = () => {
  const { entitySubgraph } = useEntityEditor();

  const rowData = useMemo<LinkRow[]>(() => {
    if (!entitySubgraph) {
      return [];
    }

    const entity = getRoots(entitySubgraph)[0]!;

    return getOutgoingLinkAndTargetEntitiesAtMoment(
      entitySubgraph,
      entity.metadata.editionId.baseId,
      /** @todo - We probably want to use entity endTime - https://app.asana.com/0/1201095311341924/1203331904553375/f */
      new Date(),
    ).map(({ linkEntity, rightEntity }) => {
      const linkEntityType = getEntityTypeById(
        entitySubgraph,
        linkEntity.metadata.entityTypeId,
      );

      const referencedEntityType = getEntityTypeById(
        entitySubgraph,
        rightEntity.metadata.entityTypeId,
      );

      return {
        expectedEntityType: referencedEntityType?.schema.title ?? "",
        linkedWith: generateEntityLabel(entitySubgraph),
        linkEntityTypeId: linkEntity.metadata.entityTypeId,
        relationship: "Outbound",
        linkEntityTypeTitle: linkEntityType?.schema.title ?? "",
      };
    });
  }, [entitySubgraph]);

  return rowData;
};
