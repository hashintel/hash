import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import type { GetLinearOrganizationQuery } from "../../../../graphql/api-types.gen";
import type { MinimalUser, Org } from "../../../../lib/user-and-org";
import type { LinearIntegration } from "./use-linear-integrations";
import type { EntityId } from "@blockprotocol/type-system";
import type { SyncWithWeb } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

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
