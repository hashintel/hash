import { useMutation } from "@apollo/client";
import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  Skeleton,
  styled,
  Table as MuiTable,
  TableBody,
  TableCell as MuiTableCell,
  tableCellClasses,
  TableHead,
  TableRow as MuiTableRow,
  tableRowClasses,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import type { FunctionComponent } from "react";

import type {
  AcceptOrgInvitationMutation,
  AcceptOrgInvitationMutationVariables,
  DeclineOrgInvitationMutation,
  DeclineOrgInvitationMutationVariables,
} from "../../graphql/api-types.gen";
import {
  acceptOrgInvitationMutation,
  declineOrgInvitationMutation,
} from "../../graphql/queries/knowledge/org.queries";
import { useInvites } from "../../shared/invites-context";
import { Button, Link } from "../../shared/ui";
import { useAuthenticatedUser, useAuthInfo } from "../shared/auth-info-context";

const Table = styled(MuiTable)(({ theme }) => ({
  borderCollapse: "separate",
  borderSpacing: 0,
  background: theme.palette.common.white,
  borderRadius: "8px",
  borderColor: theme.palette.gray[30],
  borderStyle: "solid",
  borderWidth: 1,
  overflow: "hidden",
}));

const TableRow = styled(MuiTableRow)(() => ({
  [`&:last-of-type .${tableCellClasses.body}`]: {
    borderBottom: "none",
  },
  [`&:first-of-type .${tableCellClasses.head}`]: {
    "&:first-of-type": {
      borderTopLeftRadius: "8px",
    },
    "&:last-of-type": {
      borderTopRightRadius: "8px",
    },
  },
  [`&:last-of-type .${tableCellClasses.body}`]: {
    "&:first-of-type": {
      borderBottomLeftRadius: "8px",
    },
    "&:last-of-type": {
      borderBottomRightRadius: "8px",
    },
  },
}));

const TableCell = styled(MuiTableCell)(({ theme }) => ({
  whiteSpace: "nowrap",
  border: 0,
  borderStyle: "solid",
  borderColor: theme.palette.gray[20],
  borderBottomWidth: 1,
  borderRightWidth: 1,
  padding: theme.spacing(0.5, 1.5),
  [`&.${tableCellClasses.head}`]: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.common.black,
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.gray[90],
  },
  "&:last-of-type": {
    borderRightWidth: 0,
  },
}));

const InviteRow: FunctionComponent<{ invite: PendingOrgInvitation }> = ({
  invite,
}) => {
  const { refetch } = useInvites();
  const { refetch: refetchAuthenticatedUser } = useAuthenticatedUser();

  const [acceptInvite] = useMutation<
    AcceptOrgInvitationMutation,
    AcceptOrgInvitationMutationVariables
  >(acceptOrgInvitationMutation, {
    onCompleted: () => {
      refetch();
      void refetchAuthenticatedUser();
    },
  });

  const [declineInvite] = useMutation<
    DeclineOrgInvitationMutation,
    DeclineOrgInvitationMutationVariables
  >(declineOrgInvitationMutation, {
    onCompleted: () => {
      refetch();
      void refetchAuthenticatedUser();
    },
  });

  const { invitedBy, org, invitationEntityId } = invite;

  return (
    <TableRow>
      <TableCell>
        <Link href={`/@${org.shortname}`}>{org.displayName}</Link>
      </TableCell>
      <TableCell>
        <Link href={`/@${invitedBy.shortname}`}>{invitedBy.displayName}</Link>
      </TableCell>
      <TableCell>{format(new Date(invite.expiresAt), "MMM d, yyyy")}</TableCell>
      <TableCell sx={{ display: "flex", columnGap: 1 }}>
        <Button
          onClick={() =>
            acceptInvite({
              variables: { orgInvitationEntityId: invitationEntityId },
            })
          }
          size="xs"
        >
          Accept
        </Button>
        <Button
          variant="tertiary"
          size="xs"
          onClick={() =>
            declineInvite({
              variables: { orgInvitationEntityId: invitationEntityId },
            })
          }
        >
          Decline
        </Button>
      </TableCell>
    </TableRow>
  );
};

export const InvitesTable = () => {
  const { loading, pendingInvites } = useInvites();

  if (pendingInvites.length === 0 && !loading) {
    return (
      <Typography>
        You don't have any pending invitations to join an organization.
      </Typography>
    );
  }

  return (
    <Table sx={{ maxWidth: 800 }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: "auto" }}>Organization</TableCell>
          <TableCell sx={{ width: "auto" }}>Invited by</TableCell>
          <TableCell sx={{ width: 120 }}>Expires</TableCell>
          <TableCell sx={{ width: 200 }}>Actions</TableCell>
        </TableRow>
      </TableHead>
      <TableBody
        sx={{
          [`> .${tableRowClasses.root}:last-of-type > .${tableCellClasses.root}`]:
            {
              borderBottomWidth: 0,
            },
        }}
      >
        {!loading ? (
          pendingInvites.map((invite) => (
            <InviteRow key={invite.invitationEntityId} invite={invite} />
          ))
        ) : (
          <TableRow>
            <TableCell>
              <Skeleton sx={{ maxWidth: 150 }} />
            </TableCell>
            <TableCell sx={{ display: "flex", columnGap: 1 }}>
              <Skeleton sx={{ width: 50 }} />
              <Skeleton sx={{ width: 50 }} />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};
