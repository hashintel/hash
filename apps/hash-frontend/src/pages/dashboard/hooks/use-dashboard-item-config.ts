import { useLazyQuery, useMutation } from "@apollo/client";
import type { JsonValue } from "@blockprotocol/core/.";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  EntityId,
  PropertyPatchOperation,
  WebId,
} from "@blockprotocol/type-system";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import type { Filter } from "@local/hash-graph-client";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { DashboardItem } from "@local/hash-isomorphic-utils/system-types/dashboarditem";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import { configureDashboardItemMutation } from "../../../graphql/queries/knowledge/dashboard.queries";
import {
  queryEntitySubgraphQuery,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";

export type ConfigStep = "goal" | "query" | "analysis" | "chart" | "complete";

export type ConfigState = {
  step: ConfigStep;
  userGoal: string;
  structuralQuery: Filter | null;
  queryExplanation: string | null;
  sampleData: unknown[] | null;
  pythonScript: string | null;
  chartData: unknown[] | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
  isLoading: boolean;
  error: string | null;
  workflowId: string | null;
};

const initialState: ConfigState = {
  step: "goal",
  userGoal: "",
  structuralQuery: null,
  queryExplanation: null,
  sampleData: null,
  pythonScript: null,
  chartData: null,
  chartType: null,
  chartConfig: null,
  isLoading: false,
  error: null,
  workflowId: null,
};

type UseDashboardItemConfigParams = {
  itemEntityId: EntityId;
  webId: WebId;
  onComplete?: () => void;
};

/**
 * Hook to manage the multi-step dashboard item configuration flow.
 *
 * Flow:
 * 1. User enters goal → saves to entity, triggers Temporal workflow
 * 2. Workflow generates query, analyzes data, creates chart config
 * 3. Workflow updates entity with results
 * 4. Frontend polls entity for updates and advances through steps
 *
 * @todo The backend workflow needs to populate these entity properties:
 *   - configurationStatus: "pending" | "configuring" | "ready" | "error"
 *   - chartType: the determined chart type
 *   - chartConfiguration: the generated ECharts config
 *   - errorMessage: error details if failed (property type TBD)
 *
 * @todo For full preview functionality, these property types need to be created:
 *   - structuralQuery: the generated Graph API filter
 *   - queryExplanation: LLM explanation of the query
 *   - pythonScript: data transformation script
 *   - chartData: transformed data for charting
 */
export const useDashboardItemConfig = ({
  itemEntityId,
  webId,
  onComplete,
}: UseDashboardItemConfigParams) => {
  const [state, setState] = useState<ConfigState>(initialState);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const [configureDashboardItem] = useMutation(configureDashboardItemMutation);

  const [fetchDashboardItem] = useLazyQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "network-only",
  });

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  /**
   * Poll the entity to check for workflow updates.
   * When configurationStatus changes, update state accordingly.
   */
  const pollEntityForUpdates = useCallback(async () => {
    try {
      const { data } = await fetchDashboardItem({
        variables: {
          request: {
            filter: {
              equal: [{ path: ["uuid"] }, { parameter: itemEntityId }],
            },
            graphResolveDepths: {
              inheritsFrom: 255,
              isOfType: true,
            },
            traversalPaths: [],
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: false,
            includePermissions: false,
          },
        },
      });

      if (!data) {
        return;
      }

      const { subgraph } =
        deserializeQueryEntitySubgraphResponse<DashboardItem>(
          data.queryEntitySubgraph,
        );

      const entities = getRoots(subgraph);
      const entity = entities[0] as HashEntity<DashboardItem> | undefined;

      if (!entity) {
        return;
      }

      const props = simplifyProperties(entity.properties);
      const status = props.configurationStatus as
        | "pending"
        | "configuring"
        | "ready"
        | "error";

      // Extract all available properties from the entity
      const structuralQuery = props.structuralQuery as Filter | undefined;
      const pythonScript = props.pythonScript as string | undefined;
      const chartType = props.chartType as ChartType | undefined;
      const chartConfig = props.chartConfiguration as ChartConfig | undefined;

      // Determine current step based on what data is available
      let newStep: ConfigStep = state.step;

      if (status === "ready") {
        stopPolling();
        newStep = "chart";
      } else if (status === "error") {
        stopPolling();
        setState((prev) => ({
          ...prev,
          error:
            (props as { errorMessage?: string }).errorMessage ??
            "Configuration failed",
          isLoading: false,
        }));
        return;
      } else if (status === "configuring") {
        // Advance steps based on what data has been populated
        if (chartConfig && chartType) {
          newStep = "chart";
        } else if (pythonScript) {
          newStep = "analysis";
        } else if (structuralQuery) {
          newStep = "query";
        }
      }

      setState((prev) => ({
        ...prev,
        structuralQuery: structuralQuery ?? prev.structuralQuery,
        pythonScript: pythonScript ?? prev.pythonScript,
        chartType: chartType ?? prev.chartType,
        chartConfig: chartConfig ?? prev.chartConfig,
        isLoading: status === "configuring",
        step: newStep,
      }));
    } catch (err) {
      // Don't stop polling on transient errors, just log
      // eslint-disable-next-line no-console
      console.error("Error polling dashboard item:", err);
    }
  }, [fetchDashboardItem, itemEntityId, stopPolling, state.step]);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      return; // Already polling
    }

    // Poll immediately, then every 2 seconds
    void pollEntityForUpdates();
    pollIntervalRef.current = setInterval(() => {
      void pollEntityForUpdates();
    }, 2000);
  }, [pollEntityForUpdates]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const setUserGoal = useCallback((userGoal: string) => {
    setState((prev) => ({ ...prev, userGoal }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, isLoading: false }));
  }, []);

  /**
   * Generate query by saving goal and triggering the AI workflow.
   * The workflow will update the entity with results.
   */
  const generateQuery = useCallback(async () => {
    if (!state.userGoal) {
      setError("Please enter a goal for this chart");
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Update the entity with the user's goal and set status to configuring
      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: itemEntityId,
            propertyPatches: [
              {
                op: "add",
                path: [systemPropertyTypes.goal.propertyTypeBaseUrl],
                property: {
                  value: state.userGoal,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
              },
              {
                op: "add",
                path: [
                  systemPropertyTypes.configurationStatus.propertyTypeBaseUrl,
                ],
                property: {
                  value: "configuring",
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
              },
            ],
          },
        },
      });

      // Trigger the AI configuration workflow
      const { data } = await configureDashboardItem({
        variables: {
          itemEntityId,
          webId,
        },
      });

      if (data?.configureDashboardItem) {
        setState((prev) => ({
          ...prev,
          workflowId: data.configureDashboardItem.workflowId,
          // Keep isLoading true while we wait for workflow
        }));

        // Start polling for workflow completion
        startPolling();
      } else {
        setError("Failed to start configuration workflow");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate query");
    }
  }, [
    state.userGoal,
    setError,
    itemEntityId,
    webId,
    updateEntity,
    configureDashboardItem,
    startPolling,
  ]);

  const regenerateQuery = useCallback(async () => {
    await generateQuery();
  }, [generateQuery]);

  /**
   * For now, skip directly to chart step since the workflow handles everything.
   * In the future, this could be expanded to show intermediate query results.
   */
  const confirmQuery = useCallback(() => {
    setState((prev) => ({ ...prev, step: "analysis" }));
  }, []);

  const regenerateAnalysis = useCallback(async () => {
    // Re-trigger the workflow
    await generateQuery();
  }, [generateQuery]);

  const confirmAnalysis = useCallback(() => {
    setState((prev) => ({ ...prev, step: "chart" }));
  }, []);

  const setChartType = useCallback((chartType: ChartType) => {
    setState((prev) => ({ ...prev, chartType }));
  }, []);

  const setChartConfig = useCallback((chartConfig: ChartConfig) => {
    setState((prev) => ({ ...prev, chartConfig }));
  }, []);

  /**
   * Save the final chart configuration to the entity.
   */
  const saveConfiguration = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const propertyPatches: PropertyPatchOperation[] = [];

      if (state.chartType) {
        propertyPatches.push({
          op: "add" as const,
          path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
          property: {
            value: state.chartType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        });
      }

      if (state.chartConfig) {
        propertyPatches.push({
          op: "add" as const,
          path: [systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl],
          property: {
            value: state.chartConfig as Record<string, JsonValue>,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        });
      }

      // Set status to ready
      propertyPatches.push({
        op: "add" as const,
        path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
        property: {
          value: "ready",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      });

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: itemEntityId,
            propertyPatches,
          },
        },
      });

      setState((prev) => ({ ...prev, step: "complete", isLoading: false }));
      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save configuration",
      );
    }
  }, [
    onComplete,
    setError,
    state.chartType,
    state.chartConfig,
    updateEntity,
    itemEntityId,
  ]);

  const reset = useCallback(() => {
    stopPolling();
    setState(initialState);
  }, [stopPolling]);

  return {
    state,
    setUserGoal,
    generateQuery,
    regenerateQuery,
    confirmQuery,
    regenerateAnalysis,
    confirmAnalysis,
    setChartType,
    setChartConfig,
    saveConfiguration,
    reset,
  };
};
