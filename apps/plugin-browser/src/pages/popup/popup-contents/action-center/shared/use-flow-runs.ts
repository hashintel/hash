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
import { useEffect, useMemo, useState } from "react";

import type {
  GetMinimalFlowRunsQuery,
  GetMinimalFlowRunsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getMinimalFlowRunsQuery } from "../../../../../graphql/queries/flow.queries";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
import type {
  BrowserFlowsAndBackgroundRequests,
  MinimalFlowRun,
} from "../../../../../shared/storage";
import { useStorageSync } from "../../../../shared/use-storage-sync";

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

const getFlowRuns = async (): Promise<BrowserFlowsAndBackgroundRequests> =>
  queryGraphQlApi<GetMinimalFlowRunsQuery, GetMinimalFlowRunsQueryVariables>(
    getMinimalFlowRunsQuery,
  )
    .then(({ data }) =>
      data.getFlowRuns.sort((a, b) => {
        if (!a.executedAt) {
          return b.executedAt ? 1 : 0;
        }
        if (!b.executedAt) {
          return -1;
        }
        return b.executedAt.localeCompare(a.executedAt);
      }),
    )
    .then((flowRuns) => {
      const browserFlowRuns: MinimalFlowRun[] = [];
      const allInputRequests: ExternalInputRequestSignal[] = [];

      for (const flowRun of flowRuns) {
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

      return {
        browserFlowRuns,
        inputRequests: allInputRequests,
      };
    });

export const useFlowRuns = (): BrowserFlowsAndBackgroundRequests & {
  loading: boolean;
} => {
  const [value, setValue, storageLoading] = useStorageSync(
    "browserFlowsAndBackgroundRequests",
    {
      browserFlowRuns: [],
      inputRequests: [],
    },
  );

  const [apiChecked, setApiChecked] = useState(false);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      void getFlowRuns().then(setValue);
    }, 2_000);

    return () => clearInterval(pollInterval);
  }, [setValue]);

  useEffect(() => {
    if (apiChecked) {
      return;
    }

    void getFlowRuns().then((newValue) => {
      setValue(newValue);
      setApiChecked(true);
    });

    setApiChecked(true);
  }, [apiChecked, setValue]);

  const [localPendingRuns, setLocalPendingRuns] = useStorageSync(
    "localPendingFlowRuns",
    [],
  );

  /**
   * Merge in any local pending runs that are not already in the API response,
   * to allow for more optimistic UI updates.
   */
  const { allFlowRuns, redundantLocalRunIds } = useMemo(() => {
    const flowRunsToShow: MinimalFlowRun[] = [];
    const redundantOptimisticRunIds: string[] = [];

    const allFlowIds = value.browserFlowRuns.map((run) => run.flowRunId);

    for (const run of localPendingRuns ?? []) {
      if (allFlowIds.includes(run.flowRunId)) {
        redundantOptimisticRunIds.push(run.flowRunId);
      } else {
        flowRunsToShow.push(run);
      }
    }

    flowRunsToShow.push(...value.browserFlowRuns);

    return {
      allFlowRuns: flowRunsToShow,
      redundantLocalRunIds: redundantOptimisticRunIds,
    };
  }, [value.browserFlowRuns, localPendingRuns]);

  /**
   * Clean up the state for any runs that have been added to the API response.
   */
  useEffect(() => {
    if (redundantLocalRunIds.length > 0 && !!localPendingRuns?.length) {
      setLocalPendingRuns(
        localPendingRuns.filter(
          (run) => !redundantLocalRunIds.includes(run.flowRunId),
        ),
      );
    }
  }, [localPendingRuns, setLocalPendingRuns, redundantLocalRunIds]);

  return useMemo(() => {
    return {
      inputRequests: value.inputRequests,
      browserFlowRuns: allFlowRuns,
      loading: !storageLoading || !apiChecked,
    };
  }, [allFlowRuns, apiChecked, storageLoading, value]);
};
