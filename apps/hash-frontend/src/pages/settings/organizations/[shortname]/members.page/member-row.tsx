import { useMutation } from "@apollo/client";
import {
  type ActorEntityUuid,
  type ActorGroupEntityUuid,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { TableCell, TableRow, Typography } from "@mui/material";

import { useBlockProtocolArchiveEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import type {
  RemoveAccountGroupMemberMutation,
  RemoveAccountGroupMemberMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { removeAccountGroupMemberMutation } from "../../../../../graphql/queries/account-group.queries";
import type { Org } from "../../../../../lib/user-and-org";
import { Link } from "../../../../../shared/ui/link";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { SettingsTableCell } from "../../../shared/settings-table-cell";
import { MemberContextMenu } from "./member-row/member-context-menu";

export const MemberRow = ({
  accountGroupId,
  membership,
  readonly,
  self,
}: {
  accountGroupId: ActorGroupEntityUuid;
  membership: Org["memberships"][0];
  readonly: boolean;
  self: boolean;
}) => {
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { refetch } = useAuthenticatedUser();

  const [removeMemberPermission] = useMutation<
    RemoveAccountGroupMemberMutation,
    RemoveAccountGroupMemberMutationVariables
  >(removeAccountGroupMemberMutation);

  const removeFromOrg = async () => {
    await Promise.all([
      archiveEntity({
        data: {
          entityId: membership.linkEntity.metadata.recordId.entityId,
        },
      }),
      removeMemberPermission({
        variables: {
          accountGroupId,
          accountId: extractWebIdFromEntityId(
            membership.user.entity.metadata.recordId.entityId,
          ) as ActorEntityUuid,
        },
      }),
    ]);

    void refetch();
  };

  return (
    <TableRow key={membership.linkEntity.metadata.recordId.entityId}>
      <SettingsTableCell>
        <Link
          href={`/@${membership.user.shortname}`}
          sx={{ textDecoration: "none" }}
        >
          {membership.user.displayName}
        </Link>
      </SettingsTableCell>
      <TableCell>
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
          @{membership.user.shortname}
        </Typography>
      </TableCell>
      <TableCell>
        {!readonly && (
          <MemberContextMenu removeFromOrg={removeFromOrg} self={self} />
        )}
      </TableCell>
    </TableRow>
  );
};
