import type {
  ActorEntityUuid,
  EntityId,
  PropertyPatchOperation,
  WebId,
} from "@blockprotocol/type-system";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { proxyActivities } from "@temporalio/workflow";

import type { createDashboardConfigurationActivities } from "../activities/dashboard-configuration.js";

const dashboardActivities = proxyActivities<
  ReturnType<typeof createDashboardConfigurationActivities>
>({
  startToCloseTimeout: "1800 second", // 30 minutes for individual activities
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
 * 2. Update status to "configuring"
 * 3. Generate a structured query based on the user goal
 * 4. Save the query to the entity
 * 5. Analyze data using the query and generate Python transformation script
 * 6. Save the Python script to the entity
 * 7. Generate chart configuration
 * 8. Save the chart config and set status to "ready"
 */
export const configureDashboardItemWorkflow = async (
  input: ConfigureDashboardItemInput,
): Promise<ConfigureDashboardItemOutput> => {
  const { itemEntityId, webId, actorId } = input;
  const authentication = { actorId };

  try {
    // Step 1: Get the dashboard item to retrieve the user goal
    const { userGoal } = await dashboardActivities.getDashboardItem({
      authentication,
      itemEntityId,
    });

    // Step 2: Update status to "configuring"
    await dashboardActivities.updateDashboardItemStatus({
      authentication,
      itemEntityId,
      status: "configuring",
    });

    // Step 3: Generate a structured query based on the user goal
    const { structuralQuery, suggestedChartType } =
      await dashboardActivities.generateDashboardQuery({
        authentication,
        userGoal,
        webId,
        itemEntityId,
      });

    // Step 4: Save the query to the entity
    await dashboardActivities.updateDashboardItem({
      authentication,
      itemEntityId,
      propertyPatches: [
        {
          op: "add",
          path: [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl],
          property: {
            value: structuralQuery,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        } as unknown as PropertyPatchOperation,
      ],
    });

    // Step 5: Analyze data using the query and generate Python transformation script
    const { pythonScript, chartData } =
      await dashboardActivities.analyzeDashboardData({
        authentication,
        structuralQuery,
        userGoal,
        suggestedChartType,
        webId,
        itemEntityId,
      });

    // Step 6: Save the Python script to the entity
    await dashboardActivities.updateDashboardItem({
      authentication,
      itemEntityId,
      propertyPatches: [
        {
          op: "add",
          path: [systemPropertyTypes.pythonScript.propertyTypeBaseUrl],
          property: {
            value: pythonScript,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
    });

    // Step 7: Generate chart configuration
    const { chartConfig } =
      await dashboardActivities.generateDashboardChartConfig({
        authentication,
        userGoal,
        suggestedChartType,
        chartData,
        webId,
        itemEntityId,
      });

    // Step 8: Save the chart config and set status to "ready"
    await dashboardActivities.updateDashboardItem({
      authentication,
      itemEntityId,
      propertyPatches: [
        {
          op: "add",
          path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
          property: {
            value: suggestedChartType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
        {
          op: "add",
          path: [systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl],
          property: {
            value: chartConfig,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        } as PropertyPatchOperation,
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: "ready",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during configuration";

    // Update item status to error
    await dashboardActivities.updateDashboardItemStatus({
      authentication,
      itemEntityId,
      status: "error",
      errorMessage,
    });

    return { success: false, errorMessage };
  }
};
