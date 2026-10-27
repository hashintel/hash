import { useEffect, useMemo, useState } from "react";

import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import {
  flowDefinitionIds,
  isHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { getMinimalFlowRunsQuery } from "../../../../../graphql/queries/flow.queries";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import { useUserContext } from "../../shared/user-context";

import type {
  GetMinimalFlowRunsQuery,
  GetMinimalFlowRunsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type {
  LocalStorage,
  MinimalFlowRun,
} from "../../../../../shared/storage";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type {
  AutomaticInferenceInputName,
  AutomaticInferenceInputs,
  browserInferenceFlowOutput,
  ManualInferenceInputName,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { PayloadKindValues } from "@local/hash-isomorphic-utils/flows/types";

const mapFlowRunToMinimalFlowRun = ({
  flowOutputs,
  ...flowRun
}: GetMinimalFlowRunsQuery["getFlowRuns"]["flowRuns"][number]): MinimalFlowRun => {
  const persistedEntities = (flowOutputs ?? []).flatMap(
    ({ outputName, payload }) => {
      if (
        outputName ===
        ("persistedEntities" satisfies (typeof browserInferenceFlowOutput)["name"])
      ) {
        /**
         * Runs from before the output became an array have a single object here instead, and show no entities.
         */
        return Array.isArray(payload.value)
          ? (payload.value as PayloadKindValues[(typeof browserInferenceFlowOutput)["payloadKind"]][])
          : [];
      }
      return [];
    },
  );

  const webPage = flowRun.flowInputs[
    "visitedWebPage" satisfies AutomaticInferenceInputName &
      ManualInferenceInputName
  ]
    ?.value as PayloadKindValues[AutomaticInferenceInputs["visitedWebPage"]["kind"]];

  return {
    persistedEntities,
    webPage,
    ...flowRun,
  };
};

const getFlowRuns = async (): Promise<MinimalFlowRun[]> =>
  queryGraphQlApi<GetMinimalFlowRunsQuery, GetMinimalFlowRunsQueryVariables>(
    getMinimalFlowRunsQuery,
  )
    .then(({ data }) =>
      data.getFlowRuns.flowRuns.sort((a, b) => {
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
          isHashFlowDefinitionEntityId(
            flowRun.flowDefinitionEntityId,
            flowDefinitionIds.manualBrowserInference,
          ) ||
          isHashFlowDefinitionEntityId(
            flowRun.flowDefinitionEntityId,
            flowDefinitionIds.automaticBrowserInference,
          )
        ) {
          flowRunsOfInterest.push(mapFlowRunToMinimalFlowRun(flowRun));
        }
      }

      return flowRunsOfInterest;
    });

export const useFlowRuns = (): {
  flowRuns: MinimalFlowRun[];
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
      void getFlowRuns().then(setValue);
    }, 2_000);

    return () => clearInterval(pollInterval);
  }, [setValue, userAccountId]);

  useEffect(() => {
    if (apiChecked || !userAccountId) {
      return;
    }

    void getFlowRuns().then((newValue) => {
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

    const allFlowIds = value.map((run) => run.flowRunEntityId);

    for (const run of localPendingRuns ?? []) {
      if (allFlowIds.includes(run.flowRunEntityId)) {
        redundantOptimisticRunIds.push(run.flowRunEntityId);
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
          (run) => !redundantLocalRunIds.includes(run.flowRunEntityId),
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
