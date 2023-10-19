import { useMutation } from "@apollo/client";
import { TableCell, TableRow, Typography } from "@mui/material";

import { useBlockProtocolArchiveEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import {
  RemoveAccountGroupMemberMutation,
  RemoveAccountGroupMemberMutationVariables,
} from "../../../../graphql/api-types.gen";
import { removeAccountGroupMemberMutation } from "../../../../graphql/queries/account-group.queries";
import { Org } from "../../../../lib/user-and-org";
import { Link } from "../../../../shared/ui/link";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { Cell } from "../shared/cell";
import { OrgContextMenu } from "./org-row/org-context-menu";

export const OrgRow = ({ org }: { org: Org }) => {
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { authenticatedUser, refetch } = useAuthenticatedUser();

  const [removeMemberPermission] = useMutation<
    RemoveAccountGroupMemberMutation,
    RemoveAccountGroupMemberMutationVariables
  >(removeAccountGroupMemberMutation);

  const leaveOrg = async () => {
    const membership = org.memberships.find(
      (option) => option.user.accountId === authenticatedUser.accountId,
    );

    if (!membership) {
      throw new Error("Membership not found");
    }

    await Promise.all([
      archiveEntity({
        data: {
          entityId: membership.linkEntity.metadata.recordId.entityId,
        },
      }),
      removeMemberPermission({
        variables: {
          accountGroupId: org.accountGroupId,
          accountId: membership.user.accountId,
        },
      }),
    ]);

    void refetch();
  };

  return (
    <TableRow key={org.entity.metadata.recordId.entityId}>
      <Cell>
        <Link
          href={`/settings/organizations/${org.shortname}/general`}
          sx={{ textDecoration: "none" }}
        >
          {org.name}
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
          @{org.shortname}
        </Typography>
      </TableCell>
      <TableCell>
        <OrgContextMenu org={org} leaveOrg={leaveOrg} />
      </TableCell>
    </TableRow>
  );
};
