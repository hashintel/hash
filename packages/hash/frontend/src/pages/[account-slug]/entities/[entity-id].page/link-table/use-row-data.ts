import { useMemo } from "react";
import { LinkTableRow } from "./types";
import { useEntityEditor } from "../entity-editor-context";
import { generateEntityLabel } from "../../../../../lib/entities";

export const useRowData = () => {
  const { entity, linkSort } = useEntityEditor();

  const rowData = useMemo<LinkTableRow[]>(() => {
    if (!entity) {
      return [];
    }

    return (
      entity?.links.map((link) => {
        const linkType =
          entity.entityTypeRootedSubgraph.referencedLinkTypes.find(
            (val) => val.linkTypeId === link.linkTypeId,
          )?.linkType;

        const referencedEntityType =
          entity.entityTypeRootedSubgraph.referencedEntityTypes.find(
            (val) => val.entityTypeId === link.targetEntity.entityTypeId,
          )?.entityType.title;

        return {
          expectedEntityType: referencedEntityType ?? "",
          linkedWith: generateEntityLabel(link.targetEntity),
          linkId: link.linkTypeId,
          relationShip: "Outbound",
          type: linkType?.title ?? "",
        };
      }) ?? []
    );
  }, [entity]);

  const sortedRowData = useMemo(() => {
    return rowData.sort((row1, row2) => {
      // we sort only by alphabetical order for now
      const key1 = String(row1[linkSort.key]);
      const key2 = String(row2[linkSort.key]);
      let comparison = key1.localeCompare(key2);

      if (linkSort.dir === "desc") {
        // reverse if descending
        comparison = -comparison;
      }

      return comparison;
    });
  }, [rowData, linkSort]);

  return sortedRowData;
};
