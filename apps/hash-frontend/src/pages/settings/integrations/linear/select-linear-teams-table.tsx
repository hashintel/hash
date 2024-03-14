import { Chip, Select } from "@hashintel/design-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { LinearIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import type { EntityId } from "@local/hash-subgraph";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import type { Dispatch, FunctionComponent, SetStateAction } from "react";
import { Fragment, useCallback, useMemo } from "react";

import type {
  GetLinearOrganizationQuery,
  SyncWithWorkspace,
} from "../../../../graphql/api-types.gen";
import type { MinimalUser, Org } from "../../../../lib/user-and-org";
import { MenuItem } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import type { LinearIntegration } from "./use-linear-integrations";

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
              ({ entity }) => entity.metadata.recordId.entityId === value,
            )!;

            return (
              <Chip
                key={value}
                label={
                  workspace.kind === "user"
                    ? workspace.displayName
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
          key={userOrOrg.entity.metadata.recordId.entityId}
          value={userOrOrg.entity.metadata.recordId.entityId}
        >
          {userOrOrg.kind === "org" ? userOrOrg.name : userOrOrg.displayName}
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

export const mapLinearOrganizationToLinearOrganizationTeamsWithWorkspaces =
  (params: { linearIntegrations: LinearIntegration[] }) =>
  (
    organization: LinearOrganization,
  ): LinearOrganizationTeamsWithWorkspaces => ({
    ...organization,
    teams: organization.teams.map((team) => ({
      ...team,
      workspaceEntityIds: params.linearIntegrations
        .find(
          ({ entity }) =>
            simplifyProperties(entity.properties as LinearIntegrationProperties)
              .linearOrgId === organization.id,
        )!
        .syncedWithWorkspaces.filter(
          ({ linearTeamIds }) =>
            linearTeamIds.length === 0 || linearTeamIds.includes(team.id),
        )
        .map(
          ({ workspaceEntity }) => workspaceEntity.metadata.recordId.entityId,
        ),
    })),
  });

export const mapLinearOrganizationToSyncWithWorkspacesInputVariable = (params: {
  linearOrganization: LinearOrganizationTeamsWithWorkspaces;
  possibleWorkspaces: (Org | MinimalUser)[];
}): SyncWithWorkspace[] =>
  params.possibleWorkspaces
    .filter(({ entity }) =>
      params.linearOrganization.teams.some(({ workspaceEntityIds }) =>
        workspaceEntityIds.includes(entity.metadata.recordId.entityId),
      ),
    )
    .map(({ entity: workspaceEntity }) => {
      const workspaceEntityId = workspaceEntity.metadata.recordId.entityId;
      const linearTeamIds = params.linearOrganization.teams
        .filter(({ workspaceEntityIds }) =>
          workspaceEntityIds.includes(workspaceEntityId),
        )
        .map(({ id }) => id);

      /** @todo: allow the user to opt-in to sync with future teams in the linear organization */

      return { workspaceEntityId, linearTeamIds };
    });

export const SelectLinearTeamsTable: FunctionComponent<{
  linearOrganizations: LinearOrganizationTeamsWithWorkspaces[];
  setLinearOrganizations: Dispatch<
    SetStateAction<LinearOrganizationTeamsWithWorkspaces[]>
  >;
}> = ({ linearOrganizations, setLinearOrganizations }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const possibleWorkspaces = useMemo(
    () => [
      authenticatedUser,
      ...authenticatedUser.memberOf.map(({ org }) => org),
    ],
    [authenticatedUser],
  );

  const handleSelectAllWorkspacesChange = useCallback(
    (params: { linearOrganization: LinearOrganizationTeamsWithWorkspaces }) =>
      (entityIds: EntityId[]) =>
        setLinearOrganizations((prev) => {
          const { id: linearOrgId, teams } = params.linearOrganization;
          const linearOrgIndex = prev.findIndex(({ id }) => id === linearOrgId);

          const previousOrganization = prev[linearOrgIndex]!;

          const previousSelectedWorkspaceEntityIds = possibleWorkspaces
            .map(({ entity }) => entity.metadata.recordId.entityId)
            .filter((workspaceEntityId) => {
              const selectedTeams = previousOrganization.teams.filter(
                ({ workspaceEntityIds }) =>
                  workspaceEntityIds.includes(workspaceEntityId),
              );

              return selectedTeams.length === teams.length;
            });

          const addedEntityIds = entityIds.filter(
            (entityId) =>
              !previousSelectedWorkspaceEntityIds.includes(entityId),
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
                          !removedWorkspaceEntityIds.includes(entityId),
                      ),
                      ...addedEntityIds,
                    ]),
                  ),
                };
              }),
            },
            ...prev.slice(linearOrgIndex + 1),
          ];
        }),
    [possibleWorkspaces, setLinearOrganizations],
  );

  const handleSelectWorkspaceChange = useCallback(
    (params: {
      linearOrganization: LinearOrganizationTeamsWithWorkspaces;
      linearTeamId: string;
    }) =>
      (entityIds: EntityId[]) =>
        setLinearOrganizations((prev) => {
          const { linearOrganization, linearTeamId } = params;
          const linearOrgIndex = prev.findIndex(
            ({ id }) => id === linearOrganization.id,
          );

          const previousOrganization = prev[linearOrgIndex]!;

          const linearTeamIndex = previousOrganization.teams.findIndex(
            ({ id }) => id === linearTeamId,
          );

          const previousTeam = previousOrganization.teams[linearTeamIndex]!;

          const previousSelectedWorkspaceEntityIds =
            previousOrganization.teams.find(({ id }) => id === linearTeamId)
              ?.workspaceEntityIds ?? [];

          const addedEntityIds = entityIds.filter(
            (entityId) =>
              !previousSelectedWorkspaceEntityIds.includes(entityId),
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
                ...previousOrganization.teams.slice(0, linearTeamIndex),
                {
                  ...previousTeam,
                  workspaceEntityIds: Array.from(
                    new Set([
                      ...previousTeam.workspaceEntityIds.filter(
                        (entityId) =>
                          !removedWorkspaceEntityIds.includes(entityId),
                      ),
                      ...addedEntityIds,
                    ]),
                  ),
                },
                ...previousOrganization.teams.slice(linearTeamIndex + 1),
              ],
            },
            ...prev.slice(linearOrgIndex + 1),
          ];
        }),
    [setLinearOrganizations],
  );

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
        {linearOrganizations.map((linearOrganization) => (
          <Fragment key={linearOrganization.id}>
            <TableRow>
              <TableCell>Workspace</TableCell>
              <TableCell>{linearOrganization.name}</TableCell>
              <TableCell>
                <SelectWorkspaces
                  selectedWorkspaceEntityIds={possibleWorkspaces
                    .map(({ entity }) => entity.metadata.recordId.entityId)
                    .filter(
                      (entityId) =>
                        linearOrganization.teams.length ===
                        linearOrganization.teams.filter(
                          ({ workspaceEntityIds }) =>
                            workspaceEntityIds.includes(entityId),
                        ).length,
                    )}
                  possibleWorkspaces={possibleWorkspaces}
                  setSelectedWorkspaceEntityIds={handleSelectAllWorkspacesChange(
                    { linearOrganization },
                  )}
                />
              </TableCell>
            </TableRow>
            {linearOrganization.teams.map(
              ({ id: linearTeamId, name: teamName }) => (
                <TableRow key={linearTeamId}>
                  <TableCell>Team</TableCell>
                  <TableCell>{teamName}</TableCell>
                  <TableCell>
                    <SelectWorkspaces
                      selectedWorkspaceEntityIds={possibleWorkspaces
                        .map(({ entity }) => entity.metadata.recordId.entityId)
                        .filter((entityId) =>
                          linearOrganization.teams
                            .find(({ id }) => id === linearTeamId)
                            ?.workspaceEntityIds.includes(entityId),
                        )}
                      possibleWorkspaces={possibleWorkspaces}
                      setSelectedWorkspaceEntityIds={handleSelectWorkspaceChange(
                        { linearOrganization, linearTeamId },
                      )}
                    />
                  </TableCell>
                </TableRow>
              ),
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
};
