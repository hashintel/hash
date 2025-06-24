import { useMutation } from "@apollo/client";
import type {   type ActorGroupEntityUuid,
ActorGroupEntityUuid ,
  type WebId,
} from "@blockprotocol/type-system";
import { isInvitationByEmail, isInvitationByShortname } from "@local/hash-isomorphic-utils/organization";
import {
  TableBody,
  type TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
  version,
} from "@mui/material";
import { TableCell, TableRow, Typography } from "@mui/material";
import { formatDistance } from "date-fns";
import { now } from "lodash";

import type {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  RemoveUserFromOrgMutation,
  RemoveUserFromOrgMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { archiveEntityMutation } from "../../../../../graphql/queries/knowledge/entity.queries";
import { removeUserFromOrgMutation } from "../../../../../graphql/queries/knowledge/org.queries";
import type { Org } from "../../../../../lib/user-and-org";
import { Link } from "../../../../../shared/ui/link";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { SettingsTable } from "../../../shared/settings-table";
import { SettingsTableCell } from "../../../shared/settings-table-cell";
import { AddMemberForm } from "./add-member-form";
import { MemberRow } from "./member-row";
import { MemberContextMenu } from "./member-row/member-context-menu";

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
          @{invitation.invitationEntity.properties["https://hash.ai/@h/types/property-type/shortname/"]}
        </Link>
        ) : (
          <Typography
            variant="smallTextLabels"
          >
            {invitation.invitationEntity.properties["https://hash.ai/@h/types/property-type/email/"]}
          </Typography>
        )}
      </SettingsTableCell>
      <SettingsTableCell>
        <Typography
          variant="smallTextLabels"
          sx={({ palette }) => ({
            background: palette.gray[10],
            borderRadius: 10,
            lineHeight: 1,
            px: "10px",
            py: "4px",
            color: palette.gray[60],
            fontWeight: 500,
            whiteSpace: "nowrap",
          })}
        >
            {formatDistance(new Date(invitation.invitationEntity.properties["https://hash.ai/@h/types/property-type/expired-at/"]), new Date(), {
              addSuffix: true,
            })}
        </Typography>
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
    <SettingsTable>
      <TableHead>
        <TableRow>
          <SettingsTableCell width="70%">Issued to</SettingsTableCell>
          <SettingsTableCell>Expires on</SettingsTableCell>
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
