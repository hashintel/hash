import {
  type FeatureFlag,
  featureFlags,
} from "@local/hash-isomorphic-utils/feature-flags";
import {
  Box,
  Chip,
  MenuItem,
  Select,
  type SxProps,
  TableCell,
  type Theme,
  Typography,
} from "@mui/material";
import { memo, useMemo, useState } from "react";

import { useUsers } from "../../components/hooks/use-users";
import type { NextPageWithLayout } from "../../shared/layout";
import { Link } from "../../shared/ui";
import {
  type CreateVirtualizedRowContentFn,
  defaultCellSx,
  VirtualizedTable,
  type VirtualizedTableColumn,
  type VirtualizedTableRow,
} from "../shared/virtualized-table";
import type { VirtualizedTableSort } from "../shared/virtualized-table/header/sort";
import { getAdminLayout } from "./admin-page-layout";

const noValueTableCellContent = (
  <Typography component="i" sx={{ color: ({ palette }) => palette.gray[50] }}>
    Not set
  </Typography>
);

const cellSx: SxProps<Theme> = {
  ...defaultCellSx,
  fontSize: 14,
  height: 40,
};

type FieldId =
  | "shortname"
  | "displayName"
  | "email"
  | "createdAt"
  | "enabledFeatureFlags";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    id: "shortname",
    label: "Shortname",
    sortable: true,
    width: 120,
  },
  {
    id: "displayName",
    label: "Display name",
    sortable: true,
    width: 120,
  },
  {
    id: "email",
    label: "Email",
    sortable: true,
    width: 120,
  },
  {
    id: "createdAt",
    label: "Date created",
    sortable: true,
    width: 150,
  },
  {
    id: "enabledFeatureFlags",
    label: "Feature flags",
    sortable: true,
    width: 200,
  },
];

type UserRowData = {
  shortname?: string;
  displayName?: string;
  enabledFeatureFlags: FeatureFlag[];
  email: string;
  createdAt: string;
};

const TableRow = memo(({ user }: { user: UserRowData }) => {
  const { shortname, displayName, email, createdAt, enabledFeatureFlags } =
    user;

  console.log(enabledFeatureFlags);

  return (
    <>
      <TableCell sx={cellSx}>
        {shortname ? (
          <Link href={`@${shortname}`}>@{shortname}</Link>
        ) : (
          noValueTableCellContent
        )}
      </TableCell>
      <TableCell sx={cellSx}>
        {displayName ?? noValueTableCellContent}
      </TableCell>
      <TableCell sx={cellSx}>{email}</TableCell>
      <TableCell sx={cellSx}>{new Date(createdAt).toISOString()}</TableCell>
      <TableCell sx={cellSx}>
        <Select
          multiple
          value={enabledFeatureFlags}
          onChange={(event) => {
            console.log(event.target.value);
          }}
          renderValue={(selected) => {
            return (
              <Box display="flex" flexWrap="wrap" gap={0.5} p={0.2}>
                {selected.map((value) => (
                  <Chip
                    color="blue"
                    key={value}
                    label={value}
                    sx={{ "& .MuiChip-label": { fontSize: 12 } }}
                  />
                ))}
              </Box>
            );
          }}
          sx={{
            "& .MuiSelect-select": {
              px: 1,
              py: 0.5,
              fontSize: 12,
            },
            width: "100%",
          }}
        >
          {featureFlags.map((featureFlag) => (
            <MenuItem key={featureFlag} value={featureFlag}>
              {featureFlag}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<UserRowData> = (
  _index,
  row,
) => <TableRow user={row.data} />;

const AdminUsersPage: NextPageWithLayout = () => {
  const { users } = useUsers();

  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    fieldId: "createdAt",
    direction: "desc",
  });

  const userRows = useMemo<VirtualizedTableRow<UserRowData>[]>(() => {
    if (!users) {
      return [];
    }

    return users
      .map((user) => ({
        id: user.entity.metadata.recordId.entityId,
        data: {
          shortname: user.shortname,
          displayName: user.displayName,
          enabledFeatureFlags:
            (user.entity.properties[
              "https://hash.ai/@h/types/property-type/enabled-feature-flags/"
            ] as FeatureFlag[] | undefined) ?? [],
          email:
            user.entity.properties[
              "https://hash.ai/@h/types/property-type/email/"
            ][0],
          createdAt: user.entity.metadata.provenance.createdAtDecisionTime,
        },
      }))
      .sort((a, b) => {
        const field = sort.fieldId;
        const direction = sort.direction === "asc" ? 1 : -1;

        if (field === "enabledFeatureFlags") {
          return (
            (a.data.enabledFeatureFlags.length -
              b.data.enabledFeatureFlags.length) *
            direction
          );
        }

        return (
          (a.data[field] ?? "").localeCompare(b.data[field] ?? "") * direction
        );
      });
  }, [users, sort]);

  return (
    <>
      <Typography
        variant="smallCaps"
        sx={{ marginBottom: 1, ml: 0.5 }}
        component="div"
      >
        Registered Users {users ? `(${users.length})` : ""}
      </Typography>
      <Box sx={{ height: 600 }}>
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          rows={userRows}
          sort={sort}
          setSort={setSort}
        />
      </Box>
    </>
  );
};

AdminUsersPage.getLayout = (page) => getAdminLayout(page);

export default AdminUsersPage;
