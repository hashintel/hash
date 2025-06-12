import type { EntityId } from "@blockprotocol/type-system";
import { Chip, Select } from "@hashintel/design-system";
import { ArrowTurnDownRightIcon } from "@hashintel/type-editor/src/entity-type-editor/shared/arrow-turn-down-right-icon";
import type { SyncWithWeb } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  Box,
  outlinedInputClasses,
  Stack,
  TableBody,
  TableHead,
  TableRow,
} from "@mui/material";
import type { value } from "jsonpath";
import type { Dispatch, FunctionComponent, SetStateAction } from "react";
import { Fragment, useCallback, useMemo, useState } from "react";

import type { GetLinearOrganizationQuery } from "../../../../graphql/api-types.gen";
import type { MinimalUser, Org } from "../../../../lib/user-and-org";
import { LinearLogoGray } from "../../../../shared/icons/linear-logo-gray";
import { MenuItem } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { SettingsTable } from "../../shared/settings-table";
import { SettingsTableCell } from "../../shared/settings-table-cell";
import type { LinearIntegration } from "./use-linear-integrations";

const SelectWebs: FunctionComponent<{
  selectedWebEntityIds: EntityId[];
  possibleWebs: (Org | MinimalUser)[];
  setSelectedWebEntityIds: (entityIds: EntityId[]) => void;
}> = ({ selectedWebEntityIds, possibleWebs, setSelectedWebEntityIds }) => {
  const [selectOpen, setSelectOpen] = useState(false);

  return (
    <Select
      fullWidth
      multiple
      value={selectedWebEntityIds}
      open={selectOpen}
      sx={{
        [`& .${outlinedInputClasses.input}`]: {
          pl: 2,
          py: 1,
        },
      }}
      onOpen={() => setSelectOpen(true)}
      onClose={() => setSelectOpen(false)}
      onChange={({ target: { value } }) => {
        setSelectedWebEntityIds(
          typeof value === "string" ? (value.split(",") as EntityId[]) : value,
        );
      }}
      renderValue={(selected) => (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {selected.map((value) => {
            const web = possibleWebs.find(
              ({ entity }) => entity.metadata.recordId.entityId === value,
            )!;

            return (
              <Chip
                key={value}
                label={web.kind === "user" ? web.displayName : web.name}
              />
            );
          })}
        </Box>
      )}
    >
      {possibleWebs.map((web) => (
        <MenuItem
          key={web.entity.metadata.recordId.entityId}
          value={web.entity.metadata.recordId.entityId}
        >
          {web.kind === "org" ? web.name : web.displayName}
        </MenuItem>
      ))}
    </Select>
  );
};

type LinearOrganization = GetLinearOrganizationQuery["getLinearOrganization"];

export type LinearOrganizationTeamsWithWebs = Omit<
  LinearOrganization,
  "teams"
> & {
  teams: (LinearOrganization["teams"][number] & {
    webEntityIds: EntityId[];
  })[];
};

export const mapLinearOrganizationToLinearOrganizationTeamsWithWebs =
  (params: { linearIntegrations: LinearIntegration[] }) =>
  (organization: LinearOrganization): LinearOrganizationTeamsWithWebs => ({
    ...organization,
    teams: organization.teams.map((team) => ({
      ...team,
      webEntityIds: params.linearIntegrations
        .find(
          ({ entity }) =>
            simplifyProperties(entity.properties).linearOrgId ===
            organization.id,
        )!
        .syncedWithWebs.filter(
          ({ linearTeamIds }) =>
            linearTeamIds.length === 0 || linearTeamIds.includes(team.id),
        )
        .map(({ webEntity }) => webEntity.metadata.recordId.entityId),
    })),
  });

export const mapLinearOrganizationToSyncWithWebsInputVariable = (params: {
  linearOrganization: LinearOrganizationTeamsWithWebs;
  possibleWebs: (Org | MinimalUser)[];
}): SyncWithWeb[] =>
  params.possibleWebs
    .filter(({ entity }) =>
      params.linearOrganization.teams.some(({ webEntityIds }) =>
        webEntityIds.includes(entity.metadata.recordId.entityId),
      ),
    )
    .map(({ entity: webEntity }) => {
      const webEntityId = webEntity.metadata.recordId.entityId;
      const linearTeamIds = params.linearOrganization.teams
        .filter(({ webEntityIds }) => webEntityIds.includes(webEntityId))
        .map(({ id }) => id);

      /** @todo: allow the user to opt-in to sync with future teams in the linear organization */

      return { webEntityId, linearTeamIds };
    });

export const SelectLinearTeamsTable: FunctionComponent<{
  linearOrganizations: LinearOrganizationTeamsWithWebs[];
  setLinearOrganizations: Dispatch<
    SetStateAction<LinearOrganizationTeamsWithWebs[]>
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
    (params: { linearOrganization: LinearOrganizationTeamsWithWebs }) =>
      (entityIds: EntityId[]) =>
        setLinearOrganizations((prev) => {
          const { id: linearOrgId, teams } = params.linearOrganization;
          const linearOrgIndex = prev.findIndex(({ id }) => id === linearOrgId);

          const previousOrganization = prev[linearOrgIndex]!;

          const previousSelectedWebEntityIds = possibleWorkspaces
            .map(({ entity }) => entity.metadata.recordId.entityId)
            .filter((webEntityId) => {
              const selectedTeams = previousOrganization.teams.filter(
                ({ webEntityIds }) => webEntityIds.includes(webEntityId),
              );

              return selectedTeams.length === teams.length;
            });

          const addedWebEntityIds = entityIds.filter(
            (entityId) => !previousSelectedWebEntityIds.includes(entityId),
          );

          const removedWebEntityIds = previousSelectedWebEntityIds.filter(
            (entityId) => !entityIds.includes(entityId),
          );

          return [
            ...prev.slice(0, linearOrgIndex),
            {
              ...prev[linearOrgIndex]!,
              teams: teams.map((team) => {
                return {
                  ...team,
                  webEntityIds: Array.from(
                    new Set([
                      ...team.webEntityIds.filter(
                        (entityId) => !removedWebEntityIds.includes(entityId),
                      ),
                      ...addedWebEntityIds,
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
      linearOrganization: LinearOrganizationTeamsWithWebs;
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

          const previousSelectedWebEntityIds =
            previousOrganization.teams.find(({ id }) => id === linearTeamId)
              ?.webEntityIds ?? [];

          const addedWebEntityIds = entityIds.filter(
            (entityId) => !previousSelectedWebEntityIds.includes(entityId),
          );

          const removedWebEntityIds = previousSelectedWebEntityIds.filter(
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
                  webEntityIds: Array.from(
                    new Set([
                      ...previousTeam.webEntityIds.filter(
                        (entityId) => !removedWebEntityIds.includes(entityId),
                      ),
                      ...addedWebEntityIds,
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
    <SettingsTable sx={{ minWidth: 650 }}>
      <TableHead>
        <TableRow sx={{ background: ({ palette }) => palette.gray[10] }}>
          <SettingsTableCell>
            Type{" "}
            <Box
              component="span"
              sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[60] }}
            >
              in Linear
            </Box>
          </SettingsTableCell>
          <SettingsTableCell>
            Name{" "}
            <Box
              component="span"
              sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[60] }}
            >
              in Linear
            </Box>
          </SettingsTableCell>
          <SettingsTableCell>
            HASH web(s){" "}
            <Box
              component="span"
              sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[60] }}
            >
              to sync with
            </Box>
          </SettingsTableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {linearOrganizations.map((linearOrganization) => (
          <Fragment key={linearOrganization.id}>
            <TableRow>
              <SettingsTableCell>
                <Stack direction="row" alignItems="center" gap={1}>
                  <LinearLogoGray sx={{ fontSize: 14 }} />
                  Workspace
                </Stack>
              </SettingsTableCell>
              <SettingsTableCell>{linearOrganization.name}</SettingsTableCell>
              <SettingsTableCell>
                <SelectWebs
                  selectedWebEntityIds={possibleWorkspaces
                    .map(({ entity }) => entity.metadata.recordId.entityId)
                    .filter(
                      (entityId) =>
                        linearOrganization.teams.length ===
                        linearOrganization.teams.filter(({ webEntityIds }) =>
                          webEntityIds.includes(entityId),
                        ).length,
                    )}
                  possibleWebs={possibleWorkspaces}
                  setSelectedWebEntityIds={handleSelectAllWorkspacesChange({
                    linearOrganization,
                  })}
                />
              </SettingsTableCell>
            </TableRow>
            {linearOrganization.teams.map(
              ({ id: linearTeamId, name: teamName }) => (
                <TableRow key={linearTeamId}>
                  <SettingsTableCell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <ArrowTurnDownRightIcon
                        sx={{
                          fontSize: 14,
                          fill: ({ palette }) => palette.gray[40],
                        }}
                      />
                      Team
                    </Stack>
                  </SettingsTableCell>
                  <SettingsTableCell>{teamName}</SettingsTableCell>
                  <SettingsTableCell>
                    <SelectWebs
                      selectedWebEntityIds={possibleWorkspaces
                        .map(({ entity }) => entity.metadata.recordId.entityId)
                        .filter((entityId) =>
                          linearOrganization.teams
                            .find(({ id }) => id === linearTeamId)
                            ?.webEntityIds.includes(entityId),
                        )}
                      possibleWebs={possibleWorkspaces}
                      setSelectedWebEntityIds={handleSelectWorkspaceChange({
                        linearOrganization,
                        linearTeamId,
                      })}
                    />
                  </SettingsTableCell>
                </TableRow>
              ),
            )}
          </Fragment>
        ))}
      </TableBody>
    </SettingsTable>
  );
};
