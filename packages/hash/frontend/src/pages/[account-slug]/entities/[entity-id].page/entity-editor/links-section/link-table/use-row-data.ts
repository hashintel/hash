import { useMemo } from "react";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { generateEntityLabel } from "../../../../../../../lib/entities";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRowData = () => {
  const { entity, linkSort } = useEntityEditor();

  const rowData = useMemo<LinkRow[]>(() => {
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

  const sortedRowData = sortRowData(rowData, linkSort);

  return sortedRowData;
};
