import { useMemo } from "react";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { generateEntityLabel } from "../../../../../../../lib/entities";
import {
  getPersistedEntityType,
  getPersistedLinkType,
} from "../../../../../../../lib/subgraph";
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
        const linkType = getPersistedLinkType(
          entity.entityTypeRootedSubgraph,
          link.linkTypeId,
        )?.inner;

        const referencedEntityType = getPersistedEntityType(
          entity.entityTypeRootedSubgraph,
          link.targetEntity.entityTypeId,
        )?.inner;

        return {
          expectedEntityType: referencedEntityType?.title ?? "",
          linkedWith: generateEntityLabel(link.targetEntity),
          linkId: link.linkTypeId,
          relationShip: "Outbound",
          type: linkType?.title ?? "",
        };
      }) ?? []
    );
  }, [entity]);

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, linkSort);
  }, [rowData, linkSort]);

  return sortedRowData;
};
