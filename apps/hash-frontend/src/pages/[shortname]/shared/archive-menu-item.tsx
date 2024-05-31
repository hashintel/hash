import { useMutation } from "@apollo/client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { ListItemIcon, ListItemText } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback } from "react";

import { useArchivePage } from "../../../components/hooks/use-archive-page";
import type {
  ArchiveEntityTypeMutation,
  ArchiveEntityTypeMutationVariables,
} from "../../../graphql/api-types.gen";
import { archiveEntityTypeMutation } from "../../../graphql/queries/ontology/entity-type.queries";
import { useFetchEntityTypes } from "../../../shared/entity-types-context/hooks";
import { BoxArchiveIcon } from "../../../shared/icons/box-archive-icon";
import { isEntityPageEntity } from "../../../shared/is-of-type";
import { MenuItem } from "../../../shared/ui/menu-item";
import {
  isItemEntityType,
  useContextBarActionsContext,
} from "../../shared/top-context-bar";

export const ArchiveMenuItem: FunctionComponent<{
  item: Entity | EntityTypeWithMetadata;
}> = ({ item }) => {
  const refetchEntityTypes = useFetchEntityTypes();

  const { closeContextMenu } = useContextBarActionsContext();

  const { archivePage } = useArchivePage();

  const [archiveEntityType] = useMutation<
    ArchiveEntityTypeMutation,
    ArchiveEntityTypeMutationVariables
  >(archiveEntityTypeMutation);

  const handleArchive = useCallback(async () => {
    if (isItemEntityType(item)) {
      await archiveEntityType({
        variables: {
          entityTypeId: item.schema.$id,
        },
      });
      await refetchEntityTypes();
    } else if (isEntityPageEntity(item)) {
      await archivePage(item.metadata.recordId.entityId);
    } else {
      throw new Error("Archiving entities is not yet supported.");
    }
    closeContextMenu();
  }, [
    closeContextMenu,
    item,
    archiveEntityType,
    archivePage,
    refetchEntityTypes,
  ]);

  return (
    <MenuItem onClick={handleArchive}>
      <ListItemIcon>
        <BoxArchiveIcon sx={{ fontSize: 16 }} />
      </ListItemIcon>
      <ListItemText
        primary={`Archive ${
          isItemEntityType(item)
            ? "type"
            : isEntityPageEntity(item)
              ? "page"
              : "entity"
        }`}
      />
    </MenuItem>
  );
};
