import { useMemo } from "react";
import { generateEntityLabel } from "../../../../../../../lib/entities";
import {
  getPersistedEntityType,
  getPersistedLinkType,
} from "../../../../../../../lib/subgraph";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRowData = () => {
  const { rootEntityAndSubgraph } = useEntityEditor();

  const rowData = useMemo<LinkRow[]>(() => {
    if (!rootEntityAndSubgraph) {
      return [];
    }

    const entity = rootEntityAndSubgraph.root;

    return (
      entity?.links.map((link) => {
        const linkType = getPersistedLinkType(
          rootEntityAndSubgraph.subgraph,
          link.linkTypeId,
        )?.inner;

        const referencedEntityType = getPersistedEntityType(
          rootEntityAndSubgraph.subgraph,
          link.targetEntity.entityTypeId,
        )?.inner;

        return {
          expectedEntityType: referencedEntityType?.title ?? "",
          linkedWith: generateEntityLabel(rootEntityAndSubgraph),
          linkId: link.linkTypeId,
          relationShip: "Outbound",
          type: linkType?.title ?? "",
        };
      }) ?? []
    );
  }, [rootEntityAndSubgraph]);

  return rowData;
};
