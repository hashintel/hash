import { useMemo } from "react";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { generateEntityLabel } from "../../../../../../../lib/entities";
import {
  getPersistedEntityType,
  getPersistedLinkType,
  rootsAsEntities,
} from "../../../../../../../lib/subgraph";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRowData = () => {
  const { entityRootedSubgraph, linkSort } = useEntityEditor();

  const rowData = useMemo<LinkRow[]>(() => {
    if (!entityRootedSubgraph) {
      return [];
    }

    const entity = entityRootedSubgraph.root;

    return (
      entity?.links.map((link) => {
        const linkType = getPersistedLinkType(
          entityRootedSubgraph,
          link.linkTypeId,
        )?.inner;

        const referencedEntityType = getPersistedEntityType(
          entityRootedSubgraph,
          link.targetEntity.entityTypeId,
        )?.inner;

        return {
          expectedEntityType: referencedEntityType?.title ?? "",
          linkedWith: generateEntityLabel(entityRootedSubgraph),
          linkId: link.linkTypeId,
          relationShip: "Outbound",
          type: linkType?.title ?? "",
        };
      }) ?? []
    );
  }, [entityRootedSubgraph]);

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, linkSort);
  }, [rowData, linkSort]);

  return sortedRowData;
};
