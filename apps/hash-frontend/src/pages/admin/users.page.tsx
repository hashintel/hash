import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { format } from "date-fns";

import { useUsers } from "../../components/hooks/use-users";
import type { NextPageWithLayout } from "../../shared/layout";
import { Link } from "../../shared/ui";
import { getAdminLayout } from "./admin-page-layout";

const AdminUsersPage: NextPageWithLayout = () => {
  const { users } = useUsers();

  return (
    <>
      <Typography variant="h5" sx={{ marginBottom: 2 }}>
        Registered Users
      </Typography>
      {/* @todo: we probably want to use a more customizable version of the `EntitiesTable` instead */}
      <Table
        sx={{
          background: ({ palette }) => palette.common.white,
          boxShadow: ({ boxShadows }) => boxShadows.xs,
          borderRadius: "6px",
          overflow: "hidden",
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Display Name</TableCell>
            <TableCell>Date Created</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users
            ? users.map(({ shortname, displayName, entity }) => (
                <TableRow key={entity.metadata.recordId.entityId}>
                  <TableCell>
                    <Link
                      href={`/admin/users/${extractEntityUuidFromEntityId(entity.metadata.recordId.entityId)}`}
                    >
                      {shortname ? `@${shortname}` : "No Value"}
                    </Link>
                  </TableCell>
                  <TableCell>{displayName ?? "No Value"}</TableCell>
                  <TableCell>
                    {format(
                      new Date(
                        entity.metadata.provenance.createdAtDecisionTime,
                      ),
                      "yyyy-MM-dd",
                    )}
                  </TableCell>
                </TableRow>
              ))
            : "Loading..."}
        </TableBody>
      </Table>
    </>
  );
};

AdminUsersPage.getLayout = (page) => getAdminLayout(page);

export default AdminUsersPage;
