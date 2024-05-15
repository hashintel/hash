import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import type {
  AutomaticInferenceTriggerInputName,
  AutomaticInferenceTriggerInputs,
  browserInferenceFlowOutput,
  ManualInferenceTriggerInputName,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type {
  ExternalInputRequestSignal,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";
import { useEffect } from "react";

import type {
  GetMinimalFlowRunsQuery,
  GetMinimalFlowRunsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getMinimalFlowRunsQuery } from "../../../../../graphql/queries/flow.queries";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import type {
  BrowserFlowsAndBackgroundRequests,
  MinimalFlowRun,
} from "../../../../../shared/storage";

const mapFlowRunToMinimalFlowRun = (
  flowRun: Omit<
    GetMinimalFlowRunsQuery["getFlowRuns"][number],
    "inputRequests"
  >,
): MinimalFlowRun => {
  const persistedEntities = (flowRun.outputs ?? []).flatMap((output) =>
    output.contents[0].outputs.flatMap(({ outputName, payload }) => {
      if (
        outputName ===
        ("persistedEntities" satisfies (typeof browserInferenceFlowOutput)["name"])
      ) {
        return (
          payload.value as PayloadKindValues[(typeof browserInferenceFlowOutput)["payloadKind"]]
        ).persistedEntities;
      }
      return [];
    }),
  );

  console.log({ persistedEntities });

  const webPage = flowRun.inputs[0].flowTrigger.outputs?.find(
    ({ outputName }) =>
      outputName ===
      ("visitedWebPage" satisfies AutomaticInferenceTriggerInputName &
        ManualInferenceTriggerInputName),
  )?.payload
    .value as PayloadKindValues[AutomaticInferenceTriggerInputs["visitedWebPage"]["kind"]];

  return {
    persistedEntities,
    webPage,
    ...flowRun,
  };
};

export const useFlowRuns = (): BrowserFlowsAndBackgroundRequests => {
  const [value, setValue] = useStorageSync(
    "browserFlowsAndBackgroundRequests",
    {
      browserFlowRuns: [],
      inputRequests: [],
    },
  );

  useEffect(() => {
    const pollInterval = setInterval(() => {
      void queryGraphQlApi<
        GetMinimalFlowRunsQuery,
        GetMinimalFlowRunsQueryVariables
      >(getMinimalFlowRunsQuery).then(({ data }) => {
        const browserFlowRuns: MinimalFlowRun[] = [];
        const allInputRequests: ExternalInputRequestSignal[] = [];

        for (const flowRun of data.getFlowRuns) {
          const { inputRequests, ...flow } = flowRun;
          if (
            flow.flowDefinitionId ===
              manualBrowserInferenceFlowDefinition.flowDefinitionId ||
            flow.flowDefinitionId ===
              automaticBrowserInferenceFlowDefinition.flowDefinitionId
          ) {
            browserFlowRuns.push(mapFlowRunToMinimalFlowRun(flowRun));
          }

          allInputRequests.push(...inputRequests);
        }

        setValue({
          browserFlowRuns,
          inputRequests: allInputRequests,
        });
      });
    }, 5_000);

    return () => clearInterval(pollInterval);
  }, [setValue]);

  return value;
};
