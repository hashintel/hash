import { useMutation } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import type {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { archiveEntityMutation } from "../../../../../graphql/queries/knowledge/entity.queries";
import { MenuItem } from "../../../../../shared/ui";
import { ContextButton, contextMenuProps } from "../../../shared/context-menu";

export const OrgIntegrationContextMenu = ({
  linkEntityId,
  onUninstall,
}: {
  linkEntityId: EntityId;
  onUninstall: () => void;
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const unlinkIntegration = async () => {
    await archiveEntity({
      variables: {
        entityId: linkEntityId,
      },
    });

    onUninstall();
  };

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu {...bindMenu(popupState)} {...contextMenuProps}>
        <MenuItem onClick={unlinkIntegration}>
          <ListItemText primary="Uninstall integration" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
