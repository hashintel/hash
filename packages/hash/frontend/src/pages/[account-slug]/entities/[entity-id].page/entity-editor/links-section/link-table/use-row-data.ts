import { useMemo } from "react";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils/sorting";
import { generateEntityLabel } from "../../../../../../../lib/entities";
import {
  getPersistedEntityType,
  getPersistedLinkType,
} from "../../../../../../../lib/subgraph";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRowData = () => {
  const { rootEntityAndSubgraph, linkSort } = useEntityEditor();

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

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, linkSort);
  }, [rowData, linkSort]);

  return sortedRowData;
};
