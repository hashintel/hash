import { useQuery } from "@apollo/client";
import { Chip, MenuItem, Select } from "@hashintel/design-system";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { FunctionComponent, useState } from "react";

import {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getLinearOrganizationQuery } from "../../../../graphql/queries/integrations/linear.queries";
import { MinimalUser, Org } from "../../../../lib/user-and-org";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";

const SelectWorkspaces: FunctionComponent<{
  selectedWorkspaceAccountIds: string[];
  possibleWorkspaces: (Org | MinimalUser)[];
  setSelectedWorkspaceAccountIds: (accountIds: string[]) => void;
}> = ({
  selectedWorkspaceAccountIds,
  possibleWorkspaces,
  setSelectedWorkspaceAccountIds,
}) => {
  return (
    <Select
      fullWidth
      multiple
      value={selectedWorkspaceAccountIds}
      onChange={({ target: { value } }) =>
        setSelectedWorkspaceAccountIds(
          typeof value === "string" ? value.split(",") : value,
        )
      }
      // input={<OutlinedInput id="select-multiple-chip" label="Chip" />}
      renderValue={(selected) => (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {selected.map((value) => {
            const workspace = possibleWorkspaces.find(
              ({ accountId }) => accountId === value,
            )!;

            return (
              <Chip
                key={value}
                label={
                  workspace.kind === "user"
                    ? workspace.preferredName
                    : workspace.name
                }
              />
            );
          })}
        </Box>
      )}
    >
      {possibleWorkspaces.map((userOrOrg) => (
        <MenuItem key={userOrOrg.accountId} value={userOrOrg.accountId}>
          {userOrOrg.kind === "org" ? userOrOrg.name : userOrOrg.preferredName}
        </MenuItem>
      ))}
    </Select>
  );
};

export const SelectLinearTeams: FunctionComponent<{ linearOrgId: string }> = ({
  linearOrgId,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const possibleWorkspaces = [authenticatedUser, ...authenticatedUser.memberOf];

  const [syncTeamsWithWorkspace, setSyncTeamsWithWorkspace] = useState<
    Map<string, string[]>
  >(
    new Map<string, string[]>(
      possibleWorkspaces.map((workspace) => [workspace.accountId, []]),
    ),
  );

  const { data } = useQuery<
    GetLinearOrganizationQuery,
    GetLinearOrganizationQueryVariables
  >(getLinearOrganizationQuery, { variables: { linearOrgId } });

  const linearOrganization = data?.getLinearOrganization;

  return (
    <Box>
      <Typography>
        Issues, cycles and other contents of Linear <strong>Workspaces</strong>{" "}
        and <strong>Teams</strong> can be made visible to any number of HASH
        workspaces.
      </Typography>
      <Table sx={{ minWidth: 650 }} aria-label="simple table">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>Type</strong> in Linear
            </TableCell>
            <TableCell>
              <strong>Name</strong> in Linear
            </TableCell>
            <TableCell>HASH workspace(s) to sync with</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Workspace</TableCell>
            <TableCell>{linearOrganization?.name}</TableCell>
            <TableCell>
              <SelectWorkspaces
                selectedWorkspaceAccountIds={possibleWorkspaces
                  .filter(
                    ({ accountId }) =>
                      linearOrganization &&
                      linearOrganization.teams.length ===
                        syncTeamsWithWorkspace.get(accountId)?.length,
                  )
                  .map(({ accountId }) => accountId)}
                possibleWorkspaces={possibleWorkspaces}
                setSelectedWorkspaceAccountIds={(accountIds) =>
                  setSyncTeamsWithWorkspace((prev) => {
                    for (const accountId of accountIds) {
                      const previousTeams = prev.get(accountId) ?? [];

                      if (
                        linearOrganization &&
                        previousTeams.length !== linearOrganization.teams.length
                      ) {
                        prev.set(
                          accountId,
                          linearOrganization.teams.map(({ id }) => id),
                        );
                      }
                    }

                    const excludedAccountIds = possibleWorkspaces
                      .map(({ accountId }) => accountId)
                      .filter((accountId) => !accountIds.includes(accountId));

                    for (const excludedAccountId of excludedAccountIds) {
                      const previousTeams = prev.get(excludedAccountId) ?? [];

                      if (
                        linearOrganization &&
                        previousTeams.length === linearOrganization.teams.length
                      ) {
                        prev.set(excludedAccountId, []);
                      }
                    }

                    return new Map(prev);
                  })
                }
              />
            </TableCell>
          </TableRow>
          {linearOrganization?.teams.map(({ id: teamId, name }) => (
            <TableRow key={teamId}>
              <TableCell>Team</TableCell>
              <TableCell>{name}</TableCell>
              <TableCell>
                <SelectWorkspaces
                  selectedWorkspaceAccountIds={possibleWorkspaces
                    .filter(({ accountId }) =>
                      syncTeamsWithWorkspace.get(accountId)?.includes(teamId),
                    )
                    .map(({ accountId }) => accountId)}
                  possibleWorkspaces={possibleWorkspaces}
                  setSelectedWorkspaceAccountIds={(accountIds) =>
                    setSyncTeamsWithWorkspace((prev) => {
                      for (const accountId of accountIds) {
                        const previousTeams = prev.get(accountId) ?? [];

                        if (!previousTeams.includes(teamId)) {
                          prev.set(accountId, [...previousTeams, teamId]);
                        }
                      }

                      const excludedAccountIds = possibleWorkspaces
                        .map(({ accountId }) => accountId)
                        .filter((accountId) => !accountIds.includes(accountId));

                      for (const excludedAccountId of excludedAccountIds) {
                        const previousTeams = prev.get(excludedAccountId) ?? [];

                        if (
                          previousTeams.includes(teamId) &&
                          previousTeams.length !==
                            linearOrganization.teams.length
                        ) {
                          prev.set(
                            excludedAccountId,
                            previousTeams.filter((id) => id !== teamId),
                          );
                        }
                      }

                      return new Map(prev);
                    })
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box display="flex" justifyContent="flex-end" columnGap={2}>
        <Button variant="tertiary">Exit without granting access</Button>
        <Button>Save and continue</Button>
      </Box>
    </Box>
  );
};
