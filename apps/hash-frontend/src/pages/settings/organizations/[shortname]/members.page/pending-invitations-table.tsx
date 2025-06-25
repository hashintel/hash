import { useMutation } from "@apollo/client";
import { isInvitationByShortname } from "@local/hash-isomorphic-utils/organization";
import {
  Box,
  ListItemText,
  Menu,
  TableBody,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
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
import type { Org } from "../../../../../lib/user-and-org";
import { Link } from "../../../../../shared/ui/link";
import { MenuItem } from "../../../../../shared/ui/menu-item";
import { ContextButton, contextMenuProps } from "../../../shared/context-menu";
import { SettingsTable } from "../../../shared/settings-table";
import { SettingsTableCell } from "../../../shared/settings-table-cell";

export const PendingInvitationContextMenu = ({
  revokeInvitation,
}: {
  revokeInvitation: () => void;
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "invitations-dropdown-menu",
  });

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu {...bindMenu(popupState)} {...contextMenuProps}>
        <MenuItem
          dangerous
          onClick={() => {
            revokeInvitation();
            popupState.close();
          }}
        >
          <ListItemText primary="Revoke invitation" />
        </MenuItem>
      </Menu>
    </Box>
  );
};

const PendingInvitationRow = ({
  invitation,
  refetchOrg,
}: {
  invitation: Org["invitations"][number];
  refetchOrg: () => void;
}) => {
  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const revokeInvitation = async () => {
    await Promise.all([
      archiveEntity({
        variables: {
          entityId: invitation.invitationEntity.entityId,
        },
      }),
      archiveEntity({
        variables: {
          entityId: invitation.linkEntity.entityId,
        },
      }),
    ]);

    refetchOrg();
  };

  return (
    <TableRow key={invitation.invitationEntity.entityId}>
      <SettingsTableCell>
        {isInvitationByShortname(invitation.invitationEntity) ? (
          <Link
            href={`/@${invitation.invitationEntity.properties["https://hash.ai/@h/types/property-type/shortname/"]}`}
            sx={{ textDecoration: "none" }}
          >
            @
            {
              invitation.invitationEntity.properties[
                "https://hash.ai/@h/types/property-type/shortname/"
              ]
            }
          </Link>
        ) : (
          <Typography variant="smallTextLabels">
            {
              invitation.invitationEntity.properties[
                "https://hash.ai/@h/types/property-type/email/"
              ]
            }
          </Typography>
        )}
      </SettingsTableCell>
      <SettingsTableCell>
        <Typography variant="smallTextLabels">
          {formatDistanceToNowStrict(
            new Date(
              invitation.invitationEntity.properties[
                "https://hash.ai/@h/types/property-type/expired-at/"
              ],
            ),
            {
              addSuffix: true,
            },
          )}
        </Typography>
      </SettingsTableCell>
      <SettingsTableCell>
        <PendingInvitationContextMenu revokeInvitation={revokeInvitation} />
      </SettingsTableCell>
    </TableRow>
  );
};

export const PendingInvitationsTable = ({
  invitations,
  refetchOrg,
}: {
  invitations: Org["invitations"];
  refetchOrg: () => void;
}) => {
  if (invitations.length === 0) {
    return null;
  }

  return (
    <SettingsTable sx={{ background: ({ palette }) => palette.common.white }}>
      <TableHead>
        <TableRow>
          <SettingsTableCell width="70%">Issued to</SettingsTableCell>
          <SettingsTableCell>Expires</SettingsTableCell>
          <SettingsTableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {invitations
          .sort(({ invitationEntity: a }, { invitationEntity: b }) =>
            a.properties["https://hash.ai/@h/types/property-type/expired-at/"] >
            b.properties["https://hash.ai/@h/types/property-type/expired-at/"]
              ? 1
              : -1,
          )
          .map((invitation) => (
            <PendingInvitationRow
              key={invitation.invitationEntity.entityId}
              invitation={invitation}
              refetchOrg={refetchOrg}
            />
          ))}
      </TableBody>
    </SettingsTable>
  );
};
