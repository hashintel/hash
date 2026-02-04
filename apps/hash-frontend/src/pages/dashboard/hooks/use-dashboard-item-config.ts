import { useLazyQuery, useMutation } from "@apollo/client";
import type { JsonValue } from "@blockprotocol/core/.";
import type {
  EntityId,
  PropertyPatchOperation,
  WebId,
} from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { configureDashboardItemFlowDefinition } from "@local/hash-isomorphic-utils/flows/frontend-flow-definitions";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  FlowRun,
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
  StartFlowMutation,
  StartFlowMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import { FlowRunStatus } from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";
import { startFlowMutation } from "../../../graphql/queries/knowledge/flow.queries";

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
  flowRunId: string | null;
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
  flowRunId: null,
};

type UseDashboardItemConfigParams = {
  itemEntityId: EntityId;
  webId: WebId;
  onComplete?: () => void;
};

/**
 * Extract typed output values from flow outputs
 */
const getOutputValue = <T>(
  outputs: StepOutput[] | undefined | null,
  name: string,
): T | null => {
  if (!outputs) {
    return null;
  }
  const output = outputs.find((op) => op.outputName === name);
  if (!output) {
    return null;
  }
  return output.payload.value as T;
};

/**
 * Hook to manage the multi-step dashboard item configuration flow.
 *
 * Flow:
 * 1. User enters goal → saves to entity, triggers Flow via startFlow mutation
 * 2. Flow generates query, analyzes data, creates chart config
 * 3. Frontend polls flow for completion
 * 4. When complete, extracts outputs and updates the entity
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

  const [startFlow] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  /**
   * @todo could probably use useQuery with pollInterval here
   */
  const [fetchFlowRun] = useLazyQuery<
    GetFlowRunByIdQuery,
    GetFlowRunByIdQueryVariables
  >(getFlowRunById, {
    fetchPolicy: "network-only",
  });

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  /**
   * Update the dashboard item entity with the flow outputs.
   */
  const updateEntityWithFlowOutputs = useCallback(
    async (flowRun: FlowRun) => {
      const outputs = flowRun.outputs as StepOutput[] | undefined;

      const structuralQueryJson = getOutputValue<string>(
        outputs,
        "structuralQuery",
      );
      const pythonScript = getOutputValue<string>(outputs, "pythonScript");
      const chartDataJson = getOutputValue<string>(outputs, "chartData");
      const chartType = getOutputValue<string>(outputs, "chartType");
      const chartConfigJson = getOutputValue<string>(outputs, "chartConfig");

      const propertyPatches: PropertyPatchOperation[] = [];

      if (structuralQueryJson) {
        propertyPatches.push({
          op: "add",
          path: [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl],
          property: {
            value: JSON.parse(structuralQueryJson),
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        } as unknown as PropertyPatchOperation);
      }

      if (pythonScript) {
        propertyPatches.push({
          op: "add",
          path: [systemPropertyTypes.pythonScript.propertyTypeBaseUrl],
          property: {
            value: pythonScript,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        });
      }

      if (chartType) {
        propertyPatches.push({
          op: "add",
          path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
          property: {
            value: chartType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        });
      }

      if (chartConfigJson) {
        propertyPatches.push({
          op: "add",
          path: [systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl],
          property: {
            value: JSON.parse(chartConfigJson) as Record<string, JsonValue>,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        } as PropertyPatchOperation);
      }

      // Set status to ready
      propertyPatches.push({
        op: "replace",
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

      // Update state with parsed values
      setState((prev) => ({
        ...prev,
        structuralQuery: structuralQueryJson
          ? (JSON.parse(structuralQueryJson) as Filter)
          : null,
        pythonScript,
        chartData: chartDataJson
          ? (JSON.parse(chartDataJson) as unknown[])
          : null,
        chartType: chartType as ChartType | null,
        chartConfig: chartConfigJson
          ? (JSON.parse(chartConfigJson) as ChartConfig)
          : null,
        step: "chart",
        isLoading: false,
      }));
    },
    [itemEntityId, updateEntity],
  );

  /**
   * Poll the flow run to check for completion.
   */
  const pollFlowForCompletion = useCallback(async () => {
    if (!state.flowRunId) {
      return;
    }

    try {
      const { data } = await fetchFlowRun({
        variables: { flowRunId: state.flowRunId },
      });

      if (!data?.getFlowRunById) {
        return;
      }

      const flowRun = data.getFlowRunById;

      // Update step based on flow progress
      const steps = flowRun.steps;
      const step1 = steps.find((st) => st.stepId === "1");
      const step2 = steps.find((st) => st.stepId === "2");
      const step3 = steps.find((st) => st.stepId === "3");

      let newStep: ConfigStep = state.step;
      if (step3?.closedAt) {
        newStep = "chart";
      } else if (step2?.closedAt) {
        newStep = "analysis";
      } else if (step1?.closedAt) {
        newStep = "query";
      }

      setState((prev) => ({ ...prev, step: newStep }));

      // Check if flow completed
      if (flowRun.status === FlowRunStatus.Completed) {
        stopPolling();
        await updateEntityWithFlowOutputs(flowRun);
        return;
      }

      // Check if flow failed
      if (
        flowRun.status === FlowRunStatus.Failed ||
        flowRun.status === FlowRunStatus.Cancelled ||
        flowRun.status === FlowRunStatus.TimedOut ||
        flowRun.status === FlowRunStatus.Terminated
      ) {
        stopPolling();

        // Update entity status to error
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: itemEntityId,
              propertyPatches: [
                {
                  op: "replace",
                  path: [
                    systemPropertyTypes.configurationStatus.propertyTypeBaseUrl,
                  ],
                  property: {
                    value: "error",
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

        setState((prev) => ({
          ...prev,
          error: flowRun.failureMessage ?? "Flow configuration failed",
          isLoading: false,
        }));
      }
    } catch (err) {
      // Don't stop polling on transient errors, just log
      // eslint-disable-next-line no-console
      console.error("Error polling flow run:", err);
    }
  }, [
    fetchFlowRun,
    state.flowRunId,
    state.step,
    stopPolling,
    updateEntityWithFlowOutputs,
    updateEntity,
    itemEntityId,
  ]);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      return; // Already polling
    }

    // Poll immediately, then every 2 seconds
    void pollFlowForCompletion();
    pollIntervalRef.current = setInterval(() => {
      void pollFlowForCompletion();
    }, 2000);
  }, [pollFlowForCompletion]);

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
   * Generate query by saving goal and triggering the Flow.
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

      // Start the flow
      const { data } = await startFlow({
        variables: {
          flowDefinition: configureDashboardItemFlowDefinition,
          flowTrigger: {
            triggerDefinitionId: "userTrigger",
            outputs: [
              {
                outputName: "userGoal",
                payload: {
                  kind: "Text",
                  value: state.userGoal,
                },
              },
            ],
          },
          flowType: "ai",
          webId,
          dataSources: {
            files: { fileEntityIds: [] },
            internetAccess: {
              enabled: false,
              browserPlugin: {
                enabled: false,
                domains: [],
              },
            },
          },
        },
      });

      if (data?.startFlow) {
        setState((prev) => ({
          ...prev,
          flowRunId: data.startFlow,
          step: "query",
        }));

        // Start polling for flow completion
        startPolling();
      } else {
        setError("Failed to start configuration flow");
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
    startFlow,
    startPolling,
  ]);

  const regenerateQuery = useCallback(async () => {
    await generateQuery();
  }, [generateQuery]);

  /**
   * Skip to chart step since the flow handles everything.
   */
  const confirmQuery = useCallback(() => {
    setState((prev) => ({ ...prev, step: "analysis" }));
  }, []);

  const regenerateAnalysis = useCallback(async () => {
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

  const setStructuralQuery = useCallback((structuralQuery: Filter | null) => {
    setState((prev) => ({ ...prev, structuralQuery }));
  }, []);

  const setPythonScript = useCallback((pythonScript: string | null) => {
    setState((prev) => ({ ...prev, pythonScript }));
  }, []);

  /**
   * Save the structural query to the entity.
   */
  const saveStructuralQuery = useCallback(
    async (structuralQuery: Filter) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: itemEntityId,
              propertyPatches: [
                {
                  op: "add" as const,
                  path: [
                    systemPropertyTypes.structuralQuery.propertyTypeBaseUrl,
                  ],
                  property: {
                    value: structuralQuery,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                    },
                  },
                } as unknown as PropertyPatchOperation,
              ],
            },
          },
        });

        setState((prev) => ({ ...prev, structuralQuery, isLoading: false }));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to save structural query",
        );
      }
    },
    [updateEntity, itemEntityId, setError],
  );

  /**
   * Save the python script to the entity.
   */
  const savePythonScript = useCallback(
    async (pythonScript: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: itemEntityId,
              propertyPatches: [
                {
                  op: "add" as const,
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
            },
          },
        });

        setState((prev) => ({ ...prev, pythonScript, isLoading: false }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save python script",
        );
      }
    },
    [updateEntity, itemEntityId, setError],
  );

  /**
   * Save the chart config to the entity.
   */
  const saveChartConfig = useCallback(
    async (chartConfig: ChartConfig) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: itemEntityId,
              propertyPatches: [
                {
                  op: "add" as const,
                  path: [
                    systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl,
                  ],
                  property: {
                    value: chartConfig as Record<string, JsonValue>,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                    },
                  },
                },
              ],
            },
          },
        });

        setState((prev) => ({ ...prev, chartConfig, isLoading: false }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save chart config",
        );
      }
    },
    [updateEntity, itemEntityId, setError],
  );

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
    setStructuralQuery,
    setPythonScript,
    saveStructuralQuery,
    savePythonScript,
    saveChartConfig,
    saveConfiguration,
    reset,
  };
};
