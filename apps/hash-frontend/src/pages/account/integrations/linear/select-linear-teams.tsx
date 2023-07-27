import { useMutation, useQuery } from "@apollo/client";
import { Chip, MenuItem, Select } from "@hashintel/design-system";
import { EntityId } from "@local/hash-subgraph/.";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { FunctionComponent, useCallback, useState } from "react";

import {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
  SyncLinearIntegrationWithWorkspacesMutation,
  SyncLinearIntegrationWithWorkspacesMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  getLinearOrganizationQuery,
  syncLinearIntegrationWithWorkspacesMutation,
} from "../../../../graphql/queries/integrations/linear.queries";
import { MinimalUser, Org } from "../../../../lib/user-and-org";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";

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
      // input={<OutlinedInput id="select-multiple-chip" label="Chip" />}
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

export const SelectLinearTeams: FunctionComponent<{
  linearIntegrationEntityId: EntityId;
  linearOrgId: string;
  onSyncedLinearTeamsWithWorkspaces: () => void;
}> = ({
  linearIntegrationEntityId,
  linearOrgId,
  onSyncedLinearTeamsWithWorkspaces,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();
  const [
    syncLinearIntegrationWithWorkspaces,
    { loading: loadingSyncLinearIntegrationWithWorkspaces },
  ] = useMutation<
    SyncLinearIntegrationWithWorkspacesMutation,
    SyncLinearIntegrationWithWorkspacesMutationVariables
  >(syncLinearIntegrationWithWorkspacesMutation, { awaitRefetchQueries: true });

  const possibleWorkspaces = [authenticatedUser, ...authenticatedUser.memberOf];

  const [syncTeamsWithWorkspace, setSyncTeamsWithWorkspace] = useState<
    Map<EntityId, string[]>
  >(
    new Map<EntityId, string[]>(
      possibleWorkspaces.map((workspace) => [
        workspace.entityRecordId.entityId,
        [],
      ]),
    ),
  );

  const { data } = useQuery<
    GetLinearOrganizationQuery,
    GetLinearOrganizationQueryVariables
  >(getLinearOrganizationQuery, { variables: { linearOrgId } });

  const linearOrganization = data?.getLinearOrganization;

  const handleSaveAndContinue = useCallback(async () => {
    /** @todo: add proper error handling */

    await syncLinearIntegrationWithWorkspaces({
      variables: {
        linearIntegrationEntityId,
        syncWithWorkspaces: Array.from(syncTeamsWithWorkspace.entries())
          .map(([workspaceEntityId, linearTeamIds]) => ({
            workspaceEntityId,
            linearTeamIds,
          }))
          /** Don't sync to workspaces where no team has been selected */
          .filter(({ linearTeamIds }) => linearTeamIds.length !== 0),
      },
    });

    onSyncedLinearTeamsWithWorkspaces();
  }, [
    onSyncedLinearTeamsWithWorkspaces,
    syncLinearIntegrationWithWorkspaces,
    linearIntegrationEntityId,
    syncTeamsWithWorkspace,
  ]);

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
                selectedWorkspaceEntityIds={possibleWorkspaces
                  .map(({ entityRecordId: { entityId } }) => entityId)
                  .filter(
                    (entityId) =>
                      linearOrganization &&
                      linearOrganization.teams.length ===
                        syncTeamsWithWorkspace.get(entityId)?.length,
                  )}
                possibleWorkspaces={possibleWorkspaces}
                setSelectedWorkspaceEntityIds={(entityIds) =>
                  setSyncTeamsWithWorkspace((prev) => {
                    for (const entityId of entityIds) {
                      const previousTeams = prev.get(entityId) ?? [];

                      if (
                        linearOrganization &&
                        previousTeams.length !== linearOrganization.teams.length
                      ) {
                        prev.set(
                          entityId,
                          linearOrganization.teams.map(({ id }) => id),
                        );
                      }
                    }

                    const excludedEntityIds = possibleWorkspaces
                      .map(({ entityRecordId: { entityId } }) => entityId)
                      .filter((entityId) => !entityId.includes(entityId));

                    for (const excludedEntityId of excludedEntityIds) {
                      const previousTeams = prev.get(excludedEntityId) ?? [];

                      if (
                        linearOrganization &&
                        previousTeams.length === linearOrganization.teams.length
                      ) {
                        prev.set(excludedEntityId, []);
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
                  selectedWorkspaceEntityIds={possibleWorkspaces
                    .map(({ entityRecordId: { entityId } }) => entityId)
                    .filter((entityId) =>
                      syncTeamsWithWorkspace.get(entityId)?.includes(teamId),
                    )}
                  possibleWorkspaces={possibleWorkspaces}
                  setSelectedWorkspaceEntityIds={(entityIds) =>
                    setSyncTeamsWithWorkspace((prev) => {
                      for (const entityId of entityIds) {
                        const previousTeams = prev.get(entityId) ?? [];

                        if (!previousTeams.includes(teamId)) {
                          prev.set(entityId, [...previousTeams, teamId]);
                        }
                      }

                      const excludedEntityIds = possibleWorkspaces
                        .map(({ entityRecordId: { entityId } }) => entityId)
                        .filter((entityId) => !entityIds.includes(entityId));

                      for (const excludedEntityId of excludedEntityIds) {
                        const previousTeams = prev.get(excludedEntityId) ?? [];

                        if (
                          previousTeams.includes(teamId) &&
                          previousTeams.length !==
                            linearOrganization.teams.length
                        ) {
                          prev.set(
                            excludedEntityId,
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
        <Button
          disabled={loadingSyncLinearIntegrationWithWorkspaces}
          onClick={handleSaveAndContinue}
        >
          Save and continue
        </Button>
      </Box>
    </Box>
  );
};
