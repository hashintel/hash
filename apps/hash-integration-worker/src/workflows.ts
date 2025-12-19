import type {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncScheduledFlightsWorkflow,
  SyncWebWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { ActivityOptions } from "@temporalio/workflow";
import { proxyActivities } from "@temporalio/workflow";

import type { createAviationActivities } from "./aviation-activities";
import type { createLinearIntegrationActivities } from "./linear-activities";

const commonConfig: ActivityOptions = {
  startToCloseTimeout: "360 second",
  retry: {
    maximumAttempts: 3,
  },
};

const linearActivities =
  proxyActivities<ReturnType<typeof createLinearIntegrationActivities>>(
    commonConfig,
  );

const aviationActivities =
  proxyActivities<ReturnType<typeof createAviationActivities>>(commonConfig);

export const syncLinearToWeb: SyncWebWorkflow = async (params) => {
  const { apiKey, webId, authentication, teamIds } = params;

  const organization = linearActivities
    .readLinearOrganization({ apiKey })
    .then((organizationEntity) =>
      linearActivities.createPartialEntities({
        authentication,
        webId,
        entities: [organizationEntity],
      }),
    );

  const users = linearActivities
    .readLinearUsers({ apiKey })
    .then((userEntities) =>
      linearActivities.createPartialEntities({
        authentication,
        webId,
        entities: userEntities,
      }),
    );

  const issues = teamIds.map((teamId) =>
    linearActivities.readAndCreateLinearIssues({
      apiKey,
      filter: { teamId },
      authentication,
      webId,
    }),
  );

  await Promise.all([organization, users, ...issues]);
};

export const createHashEntityFromLinearData: CreateHashEntityFromLinearData =
  async (params) => {
    await linearActivities.createHashEntityFromLinearData(params);
  };

export const updateHashEntityFromLinearData: UpdateHashEntityFromLinearData =
  async (params) => {
    await linearActivities.updateHashEntityFromLinearData(params);
  };

export const readLinearTeams: ReadLinearTeamsWorkflow = async ({ apiKey }) =>
  linearActivities.readLinearTeams({ apiKey });

export const updateLinearData: UpdateLinearDataWorkflow = async (params) =>
  linearActivities.updateLinearData(params);

export const syncScheduledFlights: SyncScheduledFlightsWorkflow = async (
  params,
) => {
  const { authentication, airportIcao, date, webId } = params;

  // Step 1: Fetch scheduled flights from AeroAPI
  const { entities, links, provenance } =
    await aviationActivities.getScheduledFlights({
      airportIcao,
      date,
    });

  // Step 2: Persist entities and links to the graph
  const result = await aviationActivities.persistFlightEntities({
    authentication,
    webId,
    entities,
    links,
    provenance,
  });

  return result;
};
