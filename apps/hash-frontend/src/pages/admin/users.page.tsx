import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  Table,
  TableBody,
  TableCell,
  tableCellClasses,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { format } from "date-fns";

import { useUsers } from "../../components/hooks/use-users";
import type { NextPageWithLayout } from "../../shared/layout";
import { Link } from "../../shared/ui";
import { getAdminLayout } from "./admin-page-layout";

const noValueTableCellContent = (
  <Typography component="i" sx={{ color: ({ palette }) => palette.gray[50] }}>
    No Value
  </Typography>
);

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
          /** @todo: we probably want to move this into the theme definition */
          background: ({ palette }) => palette.common.white,
          boxShadow: ({ boxShadows }) => boxShadows.xs,
          borderRadius: "6px",
          overflow: "hidden",
          [`.${tableCellClasses.root}:not(:last-of-type)`]: {
            borderRightStyle: "solid",
            borderRightWidth: 1,
            borderRightColor: ({ palette }) => palette.gray[20],
          },
        }}
      >
        <TableHead
          sx={{
            [`.${tableCellClasses.root}`]: {
              fontWeight: 600,
              borderBottomColor: ({ palette }) => palette.gray[20],
            },
          }}
        >
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Display name</TableCell>
            <TableCell>Email address</TableCell>
            <TableCell>Date created</TableCell>
          </TableRow>
        </TableHead>
        <TableBody
          sx={{
            [`.${tableCellClasses.root}`]: {
              borderBottom: "none",
            },
          }}
        >
          {users
            ? users.map(({ shortname, displayName, entity }) => {
                const [email] =
                  entity.properties[
                    "https://hash.ai/@hash/types/property-type/email/"
                  ];

                return (
                  <TableRow key={entity.metadata.recordId.entityId}>
                    <TableCell>
                      {shortname ? (
                        <Link
                          sx={{ fontWeight: 700, textDecoration: "none" }}
                          href={`/admin/users/${extractEntityUuidFromEntityId(entity.metadata.recordId.entityId)}`}
                        >
                          @{shortname}
                        </Link>
                      ) : (
                        noValueTableCellContent
                      )}
                    </TableCell>
                    <TableCell>
                      {displayName ?? noValueTableCellContent}
                    </TableCell>
                    <TableCell>{email}</TableCell>
                    <TableCell>
                      {format(
                        new Date(
                          entity.metadata.provenance.createdAtDecisionTime,
                        ),
                        "yyyy-MM-dd",
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            : "Loading..."}
        </TableBody>
      </Table>
    </>
  );
};

AdminUsersPage.getLayout = (page) => getAdminLayout(page);

export default AdminUsersPage;
