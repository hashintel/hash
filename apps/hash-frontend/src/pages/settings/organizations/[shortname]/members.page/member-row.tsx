import { useMutation } from "@apollo/client";
import {
  AccountEntityId,
  AccountGroupId,
  extractAccountId,
} from "@local/hash-subgraph";
import { TableCell, TableRow, Typography } from "@mui/material";

import { useBlockProtocolArchiveEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import {
  RemoveAccountGroupMemberMutation,
  RemoveAccountGroupMemberMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { removeAccountGroupMemberMutation } from "../../../../../graphql/queries/account-group.queries";
import { Org } from "../../../../../lib/user-and-org";
import { Link } from "../../../../../shared/ui/link";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { Cell } from "../../shared/cell";
import { MemberContextMenu } from "./member-row/member-context-menu";

export const MemberRow = ({
  accountGroupId,
  membership,
  readonly,
  self,
}: {
  accountGroupId: AccountGroupId;
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
          accountId: extractAccountId(
            membership.user.entity.metadata.recordId
              .entityId as AccountEntityId,
          ),
        },
      }),
    ]);

    void refetch();
  };

  return (
    <TableRow key={membership.linkEntity.metadata.recordId.entityId}>
      <Cell>
        <Link
          href={`/@${membership.user.shortname}`}
          sx={{ textDecoration: "none" }}
        >
          {membership.user.displayName}
        </Link>
      </Cell>
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
