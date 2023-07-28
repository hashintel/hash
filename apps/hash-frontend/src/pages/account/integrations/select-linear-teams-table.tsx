import { Chip, MenuItem, Select } from "@hashintel/design-system";
import { EntityId } from "@local/hash-subgraph/.";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { Dispatch, Fragment, FunctionComponent, SetStateAction } from "react";

import { GetLinearOrganizationQuery } from "../../../graphql/api-types.gen";
import { MinimalUser, Org } from "../../../lib/user-and-org";
import { useAuthenticatedUser } from "../../shared/auth-info-context";

const SelectWorkspaces: FunctionComponent<{
  selectedWorkspaceEntityIds: EntityId[];
  possibleWorkspaces: (Org | MinimalUser)[];
  setSelectedWorkspaceEntityIds: (entityIds: EntityId[]) => void;
}> = ({
  selectedWorkspaceEntityIds,
  possibleWorkspaces,
  setSelectedWorkspaceEntityIds,
}) => {
  return (
    <Select
      fullWidth
      multiple
      value={selectedWorkspaceEntityIds}
      onChange={({ target: { value } }) =>
        setSelectedWorkspaceEntityIds(
          typeof value === "string" ? (value.split(",") as EntityId[]) : value,
        )
      }
      renderValue={(selected) => (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {selected.map((value) => {
            const workspace = possibleWorkspaces.find(
              ({ entityRecordId: { entityId } }) => entityId === value,
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
        <MenuItem
          key={userOrOrg.entityRecordId.entityId}
          value={userOrOrg.entityRecordId.entityId}
        >
          {userOrOrg.kind === "org" ? userOrOrg.name : userOrOrg.preferredName}
        </MenuItem>
      ))}
    </Select>
  );
};

type LinearOrganization = GetLinearOrganizationQuery["getLinearOrganization"];

export type LinearOrganizationTeamsWithWorkspaces = Omit<
  LinearOrganization,
  "teams"
> & {
  teams: (LinearOrganization["teams"][number] & {
    workspaceEntityIds: EntityId[];
  })[];
};

export const SelectLinearTeamsTable: FunctionComponent<{
  linearOrganizations: LinearOrganizationTeamsWithWorkspaces[];
  setLinearOrganizations: Dispatch<
    SetStateAction<LinearOrganizationTeamsWithWorkspaces[]>
  >;
}> = ({ linearOrganizations, setLinearOrganizations }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const possibleWorkspaces = [authenticatedUser, ...authenticatedUser.memberOf];

  return (
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
        {linearOrganizations.map(
          ({ id: linearOrgId, name: orgName, teams }) => (
            <Fragment key={linearOrgId}>
              <TableRow>
                <TableCell>Workspace</TableCell>
                <TableCell>{orgName}</TableCell>
                <TableCell>
                  <SelectWorkspaces
                    selectedWorkspaceEntityIds={possibleWorkspaces
                      .map(({ entityRecordId: { entityId } }) => entityId)
                      .filter(
                        (entityId) =>
                          teams.length ===
                          teams.filter(({ workspaceEntityIds }) =>
                            workspaceEntityIds.includes(entityId),
                          ).length,
                      )}
                    possibleWorkspaces={possibleWorkspaces}
                    setSelectedWorkspaceEntityIds={(entityIds) =>
                      setLinearOrganizations((prev) => {
                        const linearOrgIndex = prev.findIndex(
                          ({ id }) => id === linearOrgId,
                        );

                        const previousOrganization = prev[linearOrgIndex]!;

                        const previousSelectedWorkspaceEntityIds =
                          possibleWorkspaces
                            .map(({ entityRecordId: { entityId } }) => entityId)
                            .filter((workspaceEntityId) => {
                              const selectedTeams =
                                previousOrganization.teams.filter(
                                  ({ workspaceEntityIds }) =>
                                    workspaceEntityIds.includes(
                                      workspaceEntityId,
                                    ),
                                );

                              return selectedTeams.length === teams.length;
                            });

                        const addedEntityIds = entityIds.filter(
                          (entityId) =>
                            !previousSelectedWorkspaceEntityIds.includes(
                              entityId,
                            ),
                        );

                        const removedWorkspaceEntityIds =
                          previousSelectedWorkspaceEntityIds.filter(
                            (entityId) => !entityIds.includes(entityId),
                          );

                        return [
                          ...prev.slice(0, linearOrgIndex),
                          {
                            ...prev[linearOrgIndex]!,
                            teams: teams.map((team) => {
                              return {
                                ...team,
                                workspaceEntityIds: Array.from(
                                  new Set([
                                    ...team.workspaceEntityIds.filter(
                                      (entityId) =>
                                        !removedWorkspaceEntityIds.includes(
                                          entityId,
                                        ),
                                    ),
                                    ...addedEntityIds,
                                  ]),
                                ),
                              };
                            }),
                          },
                          ...prev.slice(linearOrgIndex + 1),
                        ];
                      })
                    }
                  />
                </TableCell>
              </TableRow>
              {teams.map(({ id: teamId, name: teamName }) => (
                <TableRow key={teamId}>
                  <TableCell>Team</TableCell>
                  <TableCell>{teamName}</TableCell>
                  <TableCell>
                    <SelectWorkspaces
                      selectedWorkspaceEntityIds={possibleWorkspaces
                        .map(({ entityRecordId: { entityId } }) => entityId)
                        .filter((entityId) =>
                          teams
                            .find(({ id }) => id === teamId)
                            ?.workspaceEntityIds.includes(entityId),
                        )}
                      possibleWorkspaces={possibleWorkspaces}
                      setSelectedWorkspaceEntityIds={(entityIds) =>
                        setLinearOrganizations((prev) => {
                          const linearOrgIndex = prev.findIndex(
                            ({ id }) => id === linearOrgId,
                          );

                          const previousOrganization = prev[linearOrgIndex]!;

                          const linearTeamIndex =
                            previousOrganization.teams.findIndex(
                              ({ id }) => id === teamId,
                            );

                          const previousTeam =
                            previousOrganization.teams[linearTeamIndex]!;

                          const previousSelectedWorkspaceEntityIds =
                            previousOrganization.teams.find(
                              ({ id }) => id === teamId,
                            )?.workspaceEntityIds ?? [];

                          const addedEntityIds = entityIds.filter(
                            (entityId) =>
                              !previousSelectedWorkspaceEntityIds.includes(
                                entityId,
                              ),
                          );

                          const removedWorkspaceEntityIds =
                            previousSelectedWorkspaceEntityIds.filter(
                              (entityId) => !entityIds.includes(entityId),
                            );

                          return [
                            ...prev.slice(0, linearOrgIndex),
                            {
                              ...previousOrganization,
                              teams: [
                                ...previousOrganization.teams.slice(
                                  0,
                                  linearTeamIndex,
                                ),
                                {
                                  ...previousTeam,
                                  workspaceEntityIds: Array.from(
                                    new Set([
                                      ...previousTeam.workspaceEntityIds.filter(
                                        (entityId) =>
                                          !removedWorkspaceEntityIds.includes(
                                            entityId,
                                          ),
                                      ),
                                      ...addedEntityIds,
                                    ]),
                                  ),
                                },
                                ...previousOrganization.teams.slice(
                                  linearTeamIndex + 1,
                                ),
                              ],
                            },
                            ...prev.slice(linearOrgIndex + 1),
                          ];
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ),
        )}
      </TableBody>
    </Table>
  );
};
