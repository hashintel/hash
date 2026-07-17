import { useApolloClient, useMutation } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeStructuralQuery } from "@local/hash-isomorphic-utils/dashboard-types";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { FlowRunStatus } from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";

import type {
  FlowRun,
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import type { JsonValue } from "@blockprotocol/core";
import type {
  EntityId,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
  StructuralQueryDefinition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";

export type DashboardItemGenerationPhase =
  | "building-query"
  | "analyzing-data"
  | "creating-chart-configuration"
  | "saving-configuration";

export const dashboardItemGenerationPhaseLabel = (
  phase: DashboardItemGenerationPhase,
): string => {
  switch (phase) {
    case "building-query":
      return "Building data query…";
    case "analyzing-data":
      return "Writing analysis code…";
    case "creating-chart-configuration":
      return "Creating chart configuration…";
    case "saving-configuration":
      return "Saving configuration…";
  }
};

export type DashboardItemGeneration = {
  itemEntityId: EntityId;
  flowRunId: string;
  phase: DashboardItemGenerationPhase;
  structuralQuery?: StructuralQueryDefinition;
  pythonScript?: string;
  chartData?: unknown[];
  chartType?: ChartType;
  chartConfig?: ChartConfig;
};

const getOutputValue = <Value>(
  outputs: StepOutput[] | undefined,
  outputName: string,
): Value | null =>
  (outputs?.find((output) => output.outputName === outputName)?.payload
    .value as Value | undefined) ?? null;

const getFlowOutputs = (flowRun: FlowRun): StepOutput[] | undefined =>
  (
    flowRun.outputs as { contents: { outputs?: StepOutput[] }[] }[] | undefined
  )?.flatMap((status) =>
    status.contents.flatMap((content) => content.outputs ?? []),
  );

const getStepOutputs = (
  step: FlowRun["steps"][number] | undefined,
): StepOutput[] | undefined =>
  (
    step?.outputs as
      | { contents: { outputs?: StepOutput[] }[] }[]
      | null
      | undefined
  )?.flatMap((status) =>
    status.contents.flatMap((content) => content.outputs ?? []),
  );

const parseJson = <Value>(value: string | null): Value | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as Value;
  } catch {
    return undefined;
  }
};

export const getDashboardItemGenerationOutputs = (
  flowRun: FlowRun,
): Partial<
  Pick<
    DashboardItemGeneration,
    | "structuralQuery"
    | "pythonScript"
    | "chartData"
    | "chartType"
    | "chartConfig"
  >
> => {
  const queryOutputs = getStepOutputs(
    flowRun.steps.find((step) => step.stepId === "1"),
  );
  const analysisOutputs = getStepOutputs(
    flowRun.steps.find((step) => step.stepId === "2"),
  );
  const chartOutputs = getStepOutputs(
    flowRun.steps.find((step) => step.stepId === "3"),
  );

  const structuralQuery = normalizeStructuralQuery(
    parseJson(getOutputValue<string>(queryOutputs, "structuralQuery")),
  );
  const pythonScript = getOutputValue<string>(analysisOutputs, "pythonScript");
  const chartData = parseJson<unknown[]>(
    getOutputValue<string>(analysisOutputs, "chartData"),
  );
  const chartType = getOutputValue<ChartType>(
    analysisOutputs,
    "suggestedChartType",
  );
  const chartConfig = parseJson<ChartConfig>(
    getOutputValue<string>(chartOutputs, "chartConfig"),
  );

  return {
    ...(structuralQuery ? { structuralQuery } : {}),
    ...(pythonScript ? { pythonScript } : {}),
    ...(chartData ? { chartData } : {}),
    ...(chartType ? { chartType } : {}),
    ...(chartConfig ? { chartConfig } : {}),
  };
};

export const getDashboardItemGenerationPhase = (
  flowRun: FlowRun,
): DashboardItemGenerationPhase => {
  const queryStep = flowRun.steps.find((step) => step.stepId === "1");
  const analysisStep = flowRun.steps.find((step) => step.stepId === "2");
  const chartStep = flowRun.steps.find((step) => step.stepId === "3");
  const outputs = getDashboardItemGenerationOutputs(flowRun);

  if (
    chartStep?.scheduledAt ||
    analysisStep?.closedAt ||
    outputs.pythonScript
  ) {
    return "creating-chart-configuration";
  }
  if (
    analysisStep?.scheduledAt ||
    queryStep?.closedAt ||
    outputs.structuralQuery
  ) {
    return "analyzing-data";
  }
  return "building-query";
};

const terminalFailureStatuses = new Set<FlowRunStatus>([
  FlowRunStatus.Failed,
  FlowRunStatus.Cancelled,
  FlowRunStatus.TimedOut,
  FlowRunStatus.Terminated,
]);

export const useDashboardItemGenerations = ({
  onSettled,
}: {
  onSettled: (itemEntityId: EntityId) => void;
}) => {
  const apolloClient = useApolloClient();
  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);
  const [generations, setGenerations] = useState<
    Record<EntityId, DashboardItemGeneration>
  >({});
  const generationsRef = useRef(generations);
  const finalizingItemIdsRef = useRef(new Set<EntityId>());

  useEffect(() => {
    generationsRef.current = generations;
  }, [generations]);

  const removeGeneration = useCallback(
    (itemEntityId: EntityId) => {
      setGenerations((currentGenerations) => {
        const remainingGenerations = { ...currentGenerations };
        delete remainingGenerations[itemEntityId];
        return remainingGenerations;
      });
      finalizingItemIdsRef.current.delete(itemEntityId);
      onSettled(itemEntityId);
    },
    [onSettled],
  );

  const markGenerationFailed = useCallback(
    async (itemEntityId: EntityId) => {
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
    },
    [updateEntity],
  );

  const finalizeGeneration = useCallback(
    async (itemEntityId: EntityId, flowRun: FlowRun) => {
      const outputs = getFlowOutputs(flowRun);
      const structuralQueryJson = getOutputValue<string>(
        outputs,
        "structuralQuery",
      );
      const structuralQuery = structuralQueryJson
        ? normalizeStructuralQuery(JSON.parse(structuralQueryJson))
        : null;
      const pythonScript = getOutputValue<string>(outputs, "pythonScript");
      const chartType = getOutputValue<ChartType>(outputs, "chartType");
      const chartConfigJson = getOutputValue<string>(outputs, "chartConfig");

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
          entityUpdate: { entityId: itemEntityId, propertyPatches },
        },
      });
    },
    [updateEntity],
  );

  const pollGeneration = useCallback(
    async (generation: DashboardItemGeneration) => {
      if (finalizingItemIdsRef.current.has(generation.itemEntityId)) {
        return;
      }

      try {
        const { data } = await apolloClient.query<
          GetFlowRunByIdQuery,
          GetFlowRunByIdQueryVariables
        >({
          query: getFlowRunById,
          variables: { flowRunId: generation.flowRunId },
          fetchPolicy: "network-only",
        });
        const flowRun = data.getFlowRunById;

        if (flowRun.status === FlowRunStatus.Completed) {
          finalizingItemIdsRef.current.add(generation.itemEntityId);
          setGenerations((currentGenerations) => ({
            ...currentGenerations,
            [generation.itemEntityId]: {
              ...generation,
              phase: "saving-configuration",
            },
          }));
          try {
            await finalizeGeneration(generation.itemEntityId, flowRun);
          } catch {
            try {
              await markGenerationFailed(generation.itemEntityId);
            } finally {
              removeGeneration(generation.itemEntityId);
            }
            return;
          }
          removeGeneration(generation.itemEntityId);
          return;
        }

        if (terminalFailureStatuses.has(flowRun.status)) {
          finalizingItemIdsRef.current.add(generation.itemEntityId);
          try {
            await markGenerationFailed(generation.itemEntityId);
          } finally {
            removeGeneration(generation.itemEntityId);
          }
          return;
        }

        const phase = getDashboardItemGenerationPhase(flowRun);
        const outputs = getDashboardItemGenerationOutputs(flowRun);
        setGenerations((currentGenerations) => ({
          ...currentGenerations,
          [generation.itemEntityId]: { ...generation, ...outputs, phase },
        }));
      } catch {
        // Treat polling failures as transient; the next interval retries.
      }
    },
    [apolloClient, finalizeGeneration, markGenerationFailed, removeGeneration],
  );

  useEffect(() => {
    const pollAllGenerations = () => {
      for (const generation of Object.values(generationsRef.current)) {
        void pollGeneration(generation);
      }
    };

    pollAllGenerations();
    const interval = setInterval(pollAllGenerations, 2_000);
    return () => clearInterval(interval);
  }, [pollGeneration]);

  const registerGeneration = useCallback(
    (generation: Omit<DashboardItemGeneration, "phase">) => {
      setGenerations((currentGenerations) => ({
        ...currentGenerations,
        [generation.itemEntityId]: {
          ...generation,
          phase: "building-query",
        },
      }));
    },
    [],
  );

  return { generations, registerGeneration };
};
