import type {
  ActorEntityUuid,
  EntityId,
  WebId,
} from "@blockprotocol/type-system";
import { proxyActivities } from "@temporalio/workflow";

import type { createDashboardConfigurationActivities } from "../activities/dashboard-configuration.js";

const dashboardActivities = proxyActivities<
  ReturnType<typeof createDashboardConfigurationActivities>
>({
  startToCloseTimeout: "3600 second", // 1 hour for full configuration
  retry: { maximumAttempts: 3 },
});

export type ConfigureDashboardItemInput = {
  itemEntityId: EntityId;
  webId: WebId;
  actorId: ActorEntityUuid;
};

export type ConfigureDashboardItemOutput = {
  success: boolean;
  errorMessage?: string;
};

/**
 * Workflow to configure a dashboard item using LLM-based activities.
 *
 * Steps:
 * 1. Get the dashboard item to retrieve the user goal
 * 2. Generate a structured query based on the user goal
 * 3. Analyze data using the query and generate Python transformation script
 * 4. Generate chart configuration
 * 5. Update the dashboard item with all generated configuration
 */
export const configureDashboardItemWorkflow = async (
  input: ConfigureDashboardItemInput,
): Promise<ConfigureDashboardItemOutput> => {
  const { itemEntityId, webId, actorId } = input;

  try {
    // Run the full configuration process in a single activity
    // This activity handles all the LLM calls internally
    await dashboardActivities.configureDashboardItem({
      authentication: { actorId },
      itemEntityId,
      webId,
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during configuration";

    // Update item status to error via activity
    await dashboardActivities.updateDashboardItemStatus({
      authentication: { actorId },
      itemEntityId,
      status: "error",
      errorMessage,
    });

    return { success: false, errorMessage };
  }
};
