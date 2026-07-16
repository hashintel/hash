import { useApolloClient, useMutation } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeStructuralQuery } from "@local/hash-isomorphic-utils/dashboard-types";
import { configureDashboardItemFlowDefinition } from "@local/hash-isomorphic-utils/flows/frontend-flow-definitions";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { FlowRunStatus } from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";
import { startFlowMutation } from "../../../graphql/queries/knowledge/flow.queries";

import type {
  FlowRun,
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
  StartFlowMutation,
  StartFlowMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import type { JsonValue } from "@blockprotocol/core/.";
import type {
  EntityId,
  PropertyPatchOperation,
  WebId,
} from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
  StructuralQueryDefinition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";

export type ConfigStep = "goal" | "query" | "analysis" | "chart" | "complete";

export type ConfigState = {
  step: ConfigStep;
  userGoal: string;
  structuralQuery: StructuralQueryDefinition | null;
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

export type DashboardItemInitialValues = {
  structuralQuery: StructuralQueryDefinition | null;
  pythonScript: string | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
};

type UseDashboardItemConfigParams = {
  /**
   * The dashboard item entity being configured, or `null` when configuring a
   * brand-new item whose entity hasn't been created yet (see
   * {@link UseDashboardItemConfigParams.createItemEntity}).
   */
  itemEntityId: EntityId | null;
  /**
   * Creates the dashboard item entity (and its link to the dashboard),
   * returning the new entity's id. Required when `itemEntityId` is `null`:
   * the entity is only created once the user first persists something
   * (generates a config or saves), so cancelling leaves nothing behind.
   */
  createItemEntity?: () => Promise<EntityId>;
  webId: WebId;
  /** The goal stored on an existing dashboard item. */
  initialGoal?: string;
  /**
   * Existing configuration stored on the entity, used to pre-populate the
   * editors when re-configuring an already-configured item.
   */
  initialValues?: DashboardItemInitialValues;
  /** Called once the flow is running so the dashboard can show its card. */
  onGenerationStarted?: () => void;
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
  createItemEntity,
  webId,
  initialGoal = "",
  initialValues,
  onGenerationStarted,
  onComplete,
}: UseDashboardItemConfigParams) => {
  /**
   * Captured once on mount — the modal is remounted for each item, so the
   * seeded state doesn't need to track later prop changes.
   */
  const seededStateRef = useRef<ConfigState>({
    ...initialState,
    userGoal: initialGoal,
    structuralQuery: initialValues?.structuralQuery ?? null,
    pythonScript: initialValues?.pythonScript ?? null,
    chartType: initialValues?.chartType ?? null,
    chartConfig: initialValues?.chartConfig ?? null,
  });

  const [state, setState] = useState<ConfigState>(seededStateRef.current);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const generationActiveRef = useRef(false);
  const generationFinalizingRef = useRef(false);
  const generationSettledRef = useRef(false);

  const entityIdRef = useRef<EntityId | null>(itemEntityId);
  const pendingEntityCreationRef = useRef<Promise<EntityId> | null>(null);

  /**
   * Resolve the entity id to persist to, creating the entity on first use
   * for new items. The in-flight promise is shared so concurrent saves don't
   * create duplicates.
   */
  const ensureEntityId = useCallback(async (): Promise<EntityId> => {
    if (entityIdRef.current) {
      return entityIdRef.current;
    }
    if (!createItemEntity) {
      throw new Error("No dashboard item entity to save to");
    }
    pendingEntityCreationRef.current ??= createItemEntity();
    const entityId = await pendingEntityCreationRef.current;
    entityIdRef.current = entityId;
    return entityId;
  }, [createItemEntity]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const [startFlow] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const apolloClient = useApolloClient();

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const markGenerationFailed = useCallback(async () => {
    try {
      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: await ensureEntityId(),
            propertyPatches: [
              {
                op: "add",
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
    } catch {
      /**
       * The original generation error is more useful to the caller. If this
       * best-effort status update also fails, the final refetch will expose
       * whatever state was successfully persisted.
       */
    }
  }, [ensureEntityId, updateEntity]);

  /**
   * Update the dashboard item entity with the flow outputs.
   */
  const updateEntityWithFlowOutputs = useCallback(
    async (flowRun: FlowRun) => {
      /**
       * The flow run's `outputs` field is a list of Status objects wrapping
       * the actual step outputs (see `StepRunOutput`) — unwrap to the flat
       * list of named outputs.
       */
      const outputs = (
        flowRun.outputs as
          | { contents: { outputs?: StepOutput[] }[] }[]
          | undefined
      )?.flatMap((status) =>
        status.contents.flatMap((content) => content.outputs ?? []),
      );

      const structuralQueryJson = getOutputValue<string>(
        outputs,
        "structuralQuery",
      );
      const pythonScript = getOutputValue<string>(outputs, "pythonScript");
      const chartDataJson = getOutputValue<string>(outputs, "chartData");
      const chartType = getOutputValue<ChartType>(outputs, "chartType");
      const chartConfigJson = getOutputValue<string>(outputs, "chartConfig");

      const structuralQuery = structuralQueryJson
        ? normalizeStructuralQuery(JSON.parse(structuralQueryJson))
        : null;

      const propertyPatches: PropertyPatchOperation[] = [];

      if (structuralQuery) {
        propertyPatches.push({
          op: "add",
          path: [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl],
          property: {
            value: structuralQuery,
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
            entityId: await ensureEntityId(),
            propertyPatches,
          },
        },
      });

      // Update state with parsed values
      setState((prev) => ({
        ...prev,
        structuralQuery,
        pythonScript,
        chartData: chartDataJson
          ? (JSON.parse(chartDataJson) as unknown[])
          : null,
        chartType,
        chartConfig: chartConfigJson
          ? (JSON.parse(chartConfigJson) as ChartConfig)
          : null,
        step: "complete",
        isLoading: false,
      }));

      // The item is fully configured – let the caller close/refresh.
      generationActiveRef.current = false;
      generationSettledRef.current = true;
      onComplete?.();
    },
    [ensureEntityId, updateEntity, onComplete],
  );

  /**
   * Poll the flow run to check for completion.
   *
   * Takes the flow run id as an argument (rather than reading it from state)
   * because the polling interval captures this callback when polling starts,
   * before the state update containing the flow run id has been applied.
   */
  const pollFlowForCompletion = useCallback(
    async (flowRunId: string) => {
      try {
        const { data } = await apolloClient.query<
          GetFlowRunByIdQuery,
          GetFlowRunByIdQueryVariables
        >({
          query: getFlowRunById,
          variables: { flowRunId },
          fetchPolicy: "network-only",
        });

        if (generationFinalizingRef.current || generationSettledRef.current) {
          return;
        }

        const flowRun = data.getFlowRunById;

        // Update step based on flow progress
        const steps = flowRun.steps;
        const step1 = steps.find((st) => st.stepId === "1");
        const step2 = steps.find((st) => st.stepId === "2");
        const step3 = steps.find((st) => st.stepId === "3");

        setState((prev) => {
          let newStep: ConfigStep = prev.step;
          if (step3?.closedAt) {
            newStep = "chart";
          } else if (step2?.closedAt) {
            newStep = "analysis";
          } else if (step1?.closedAt) {
            newStep = "query";
          }
          return { ...prev, step: newStep };
        });

        // Check if flow completed
        if (flowRun.status === FlowRunStatus.Completed) {
          generationFinalizingRef.current = true;
          try {
            await updateEntityWithFlowOutputs(flowRun);
            stopPolling();
          } finally {
            generationFinalizingRef.current = false;
          }
          return;
        }

        // Check if flow failed
        if (
          flowRun.status === FlowRunStatus.Failed ||
          flowRun.status === FlowRunStatus.Cancelled ||
          flowRun.status === FlowRunStatus.TimedOut ||
          flowRun.status === FlowRunStatus.Terminated
        ) {
          generationFinalizingRef.current = true;

          try {
            // Update entity status to error
            await updateEntity({
              variables: {
                entityUpdate: {
                  entityId: await ensureEntityId(),
                  propertyPatches: [
                    {
                      op: "replace",
                      path: [
                        systemPropertyTypes.configurationStatus
                          .propertyTypeBaseUrl,
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

            generationSettledRef.current = true;
            generationActiveRef.current = false;
            stopPolling();
            setState((prev) => ({
              ...prev,
              error: flowRun.failureMessage ?? "Flow configuration failed",
              isLoading: false,
            }));
            onComplete?.();
          } finally {
            generationFinalizingRef.current = false;
          }
        }
      } catch (err) {
        // Don't stop polling on transient errors, just log
        // eslint-disable-next-line no-console
        console.error("Error polling flow run:", err);
      }
    },
    [
      apolloClient,
      stopPolling,
      updateEntityWithFlowOutputs,
      updateEntity,
      ensureEntityId,
      onComplete,
    ],
  );

  const startPolling = useCallback(
    (flowRunId: string) => {
      if (pollIntervalRef.current) {
        return; // Already polling
      }

      // Poll immediately, then every 2 seconds
      void pollFlowForCompletion(flowRunId);
      pollIntervalRef.current = setInterval(() => {
        void pollFlowForCompletion(flowRunId);
      }, 2000);
    },
    [pollFlowForCompletion],
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      /**
       * A running generation owns its polling independently of the modal.
       * This lets it finalize after the modal or dashboard page unmounts.
       */
      if (!generationActiveRef.current) {
        stopPolling();
      }
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

    generationSettledRef.current = false;
    generationFinalizingRef.current = false;
    generationActiveRef.current = true;
    setState((prev) => ({
      ...prev,
      step: "query",
      isLoading: true,
      error: null,
    }));

    try {
      // Update the entity with the user's goal and set status to configuring
      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: await ensureEntityId(),
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

        onGenerationStarted?.();

        // Start polling for flow completion
        startPolling(data.startFlow);
      } else {
        setError("Failed to start configuration flow");
        await markGenerationFailed();
        generationActiveRef.current = false;
        onComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate query");
      await markGenerationFailed();
      generationActiveRef.current = false;
      onComplete?.();
    }
  }, [
    state.userGoal,
    setError,
    ensureEntityId,
    webId,
    updateEntity,
    startFlow,
    startPolling,
    onGenerationStarted,
    onComplete,
    markGenerationFailed,
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

  const setStructuralQuery = useCallback(
    (structuralQuery: StructuralQueryDefinition | null) => {
      setState((prev) => ({ ...prev, structuralQuery }));
    },
    [],
  );

  const setPythonScript = useCallback((pythonScript: string | null) => {
    setState((prev) => ({ ...prev, pythonScript }));
  }, []);

  /**
   * Save the structural query to the entity.
   */
  const saveStructuralQuery = useCallback(
    async (structuralQuery: StructuralQueryDefinition) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: await ensureEntityId(),
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
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to save structural query");
        setError(error.message);
        throw error;
      }
    },
    [updateEntity, ensureEntityId, setError],
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
              entityId: await ensureEntityId(),
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
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to save python script");
        setError(error.message);
        throw error;
      }
    },
    [updateEntity, ensureEntityId, setError],
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
              entityId: await ensureEntityId(),
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
        const error =
          err instanceof Error ? err : new Error("Failed to save chart config");
        setError(error.message);
        throw error;
      }
    },
    [updateEntity, ensureEntityId, setError],
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
            entityId: await ensureEntityId(),
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
    ensureEntityId,
  ]);

  const reset = useCallback(() => {
    stopPolling();
    generationActiveRef.current = false;
    generationFinalizingRef.current = false;
    generationSettledRef.current = false;
    setState(seededStateRef.current);
  }, [stopPolling]);

  return {
    state,
    ensureItemEntity: ensureEntityId,
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
