import { useMemo } from "react";
import { LinkRow } from "./types";
import { useEntityEditor } from "../entity-editor-context";
import { generateEntityLabel } from "../../../../../lib/entities";
import { sortRowData } from "../../../../../components/GlideGlid/utils";
import {
  getPersistedEntityType,
  getPersistedLinkType,
} from "../../../../../lib/subgraph";
import { mustBeVersionedUri } from "../../../types/entity-type/util";

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
