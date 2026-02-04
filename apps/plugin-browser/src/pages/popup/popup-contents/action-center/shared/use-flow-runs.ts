import type { ActorEntityUuid } from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
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
import type { PayloadKindValues } from "@local/hash-isomorphic-utils/flows/types";
import { useEffect, useMemo, useState } from "react";

import type {
  GetMinimalFlowRunsQuery,
  GetMinimalFlowRunsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getMinimalFlowRunsQuery } from "../../../../../graphql/queries/flow.queries";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
import type {
  FlowFromBrowserOrWithPageRequest,
  LocalStorage,
  MinimalFlowRun,
} from "../../../../../shared/storage";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import { useUserContext } from "../../shared/user-context";

const mapFlowRunToMinimalFlowRun = (
  flowRun: GetMinimalFlowRunsQuery["getFlowRuns"][number],
): MinimalFlowRun => {
  const persistedEntities = (flowRun.outputs ?? []).flatMap((output) =>
    (output.contents[0]?.outputs ?? []).flatMap(({ outputName, payload }) => {
      if (
        outputName ===
        ("persistedEntities" satisfies (typeof browserInferenceFlowOutput)["name"])
      ) {
        return (
          payload.value as unknown as PayloadKindValues[(typeof browserInferenceFlowOutput)["payloadKind"]]
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

const getFlowRuns = async ({
  userAccountId,
}: {
  userAccountId: ActorEntityUuid;
}): Promise<FlowFromBrowserOrWithPageRequest[]> =>
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
    .then((unfilteredFlowRuns) => {
      const flowRunsOfInterest: LocalStorage["flowRuns"] = [];

      for (const flowRun of unfilteredFlowRuns) {
        if (
          flowRun.flowDefinitionId ===
            manualBrowserInferenceFlowDefinition.flowDefinitionId ||
          flowRun.flowDefinitionId ===
            automaticBrowserInferenceFlowDefinition.flowDefinitionId
        ) {
          flowRunsOfInterest.push(mapFlowRunToMinimalFlowRun(flowRun));
        }

        for (const inputRequest of flowRun.inputRequests) {
          if (
            inputRequest.type === "get-urls-html-content" &&
            !!inputRequest.resolvedAt &&
            inputRequest.resolvedBy === userAccountId
          ) {
            for (const url of inputRequest.data.urls) {
              flowRunsOfInterest.push({
                ...mapFlowRunToMinimalFlowRun(flowRun),
                requestedPageUrl: url,
              });
            }
          }
        }
      }

      return flowRunsOfInterest;
    });

export const useFlowRuns = (): {
  flowRuns: FlowFromBrowserOrWithPageRequest[];
} & {
  loading: boolean;
} => {
  const [value, setValue, storageLoading] = useStorageSync("flowRuns", []);

  const [apiChecked, setApiChecked] = useState(false);

  const { user } = useUserContext();

  const userAccountId = useMemo(() => {
    if (!user) {
      return null;
    }
    return extractWebIdFromEntityId(
      user.metadata.recordId.entityId,
    ) as ActorEntityUuid;
  }, [user]);

  useEffect(() => {
    if (!userAccountId) {
      return;
    }

    const pollInterval = setInterval(() => {
      void getFlowRuns({ userAccountId }).then(setValue);
    }, 2_000);

    return () => clearInterval(pollInterval);
  }, [setValue, userAccountId]);

  useEffect(() => {
    if (apiChecked || !userAccountId) {
      return;
    }

    void getFlowRuns({ userAccountId }).then((newValue) => {
      setValue(newValue);
      setApiChecked(true);
    });

    setApiChecked(true);
  }, [apiChecked, setValue, userAccountId]);

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

    const allFlowIds = value.map((run) => run.flowRunId);

    for (const run of localPendingRuns ?? []) {
      if (allFlowIds.includes(run.flowRunId)) {
        redundantOptimisticRunIds.push(run.flowRunId);
      } else {
        flowRunsToShow.push(run);
      }
    }

    flowRunsToShow.push(...value);

    return {
      allFlowRuns: flowRunsToShow,
      redundantLocalRunIds: redundantOptimisticRunIds,
    };
  }, [value, localPendingRuns]);

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
      flowRuns: allFlowRuns,
      loading: !storageLoading || !apiChecked,
    };
  }, [allFlowRuns, apiChecked, storageLoading]);
};
