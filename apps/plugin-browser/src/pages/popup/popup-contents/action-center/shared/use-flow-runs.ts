import { useEffect, useMemo, useRef, useState } from "react";

import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import {
  flowDefinitionIds,
  isHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { FlowRunStatus } from "../../../../../graphql/api-types.gen";
import {
  getFlowRunOutputsQuery,
  getMinimalFlowRunsQuery,
} from "../../../../../graphql/queries/flow.queries";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import { useUserContext } from "../../shared/user-context";

import type {
  GetFlowRunOutputsQuery,
  GetFlowRunOutputsQueryVariables,
  GetMinimalFlowRunsQuery,
  GetMinimalFlowRunsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { MinimalFlowRun } from "../../../../../shared/storage";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type {
  AutomaticInferenceInputName,
  AutomaticInferenceInputs,
  browserInferenceFlowOutput,
  ManualInferenceInputName,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { PayloadKindValues } from "@local/hash-isomorphic-utils/flows/types";

const getPersistedEntitiesFromOutputs = (
  outputs: GetFlowRunOutputsQuery["getFlowRunById"]["outputs"],
) =>
  (outputs ?? []).flatMap(({ outputName, payload }) => {
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
  });

/**
 * The entities a run persisted, which only a completed run has. They don't change until it's reset and completes
 * again, closing at another time, so they're read once each time it completes.
 */
const getPersistedEntities = async (
  flowRun: GetMinimalFlowRunsQuery["getFlowRuns"]["flowRuns"][number],
  previousFlowRuns: MinimalFlowRun[],
) => {
  if (flowRun.status !== FlowRunStatus.Completed) {
    return [];
  }

  const previousFlowRun = previousFlowRuns.find(
    ({ flowRunEntityId, status, closedAt }) =>
      flowRunEntityId === flowRun.flowRunEntityId &&
      status === FlowRunStatus.Completed &&
      closedAt === flowRun.closedAt,
  );

  if (previousFlowRun) {
    return previousFlowRun.persistedEntities;
  }

  const { data } = await queryGraphQlApi<
    GetFlowRunOutputsQuery,
    GetFlowRunOutputsQueryVariables
  >(getFlowRunOutputsQuery, { flowRunEntityId: flowRun.flowRunEntityId });

  return getPersistedEntitiesFromOutputs(data.getFlowRunById.outputs);
};

const mapFlowRunToMinimalFlowRun = async (
  flowRun: GetMinimalFlowRunsQuery["getFlowRuns"]["flowRuns"][number],
  previousFlowRuns: MinimalFlowRun[],
): Promise<MinimalFlowRun> => {
  const webPage = flowRun.flowInputs[
    "visitedWebPage" satisfies AutomaticInferenceInputName &
      ManualInferenceInputName
  ]
    ?.value as PayloadKindValues[AutomaticInferenceInputs["visitedWebPage"]["kind"]];

  return {
    persistedEntities: await getPersistedEntities(flowRun, previousFlowRuns),
    webPage,
    ...flowRun,
  };
};

const getFlowRuns = async (
  previousFlowRuns: MinimalFlowRun[],
): Promise<MinimalFlowRun[]> => {
  const { data } = await queryGraphQlApi<
    GetMinimalFlowRunsQuery,
    GetMinimalFlowRunsQueryVariables
  >(getMinimalFlowRunsQuery);

  const flowRunsOfInterest = data.getFlowRuns.flowRuns
    .filter(
      ({ flowDefinitionEntityId }) =>
        isHashFlowDefinitionEntityId(
          flowDefinitionEntityId,
          flowDefinitionIds.manualBrowserInference,
        ) ||
        isHashFlowDefinitionEntityId(
          flowDefinitionEntityId,
          flowDefinitionIds.automaticBrowserInference,
        ),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return Promise.all(
    flowRunsOfInterest.map((flowRun) =>
      mapFlowRunToMinimalFlowRun(flowRun, previousFlowRuns),
    ),
  );
};

export const useFlowRuns = (): {
  flowRuns: MinimalFlowRun[];
} & {
  loading: boolean;
} => {
  const [value, setValue, storageLoading] = useStorageSync("flowRuns", []);

  /* The runs as last read, whose persisted entities a poll reuses. */
  const flowRunsRef = useRef(value);
  useEffect(() => {
    flowRunsRef.current = value;
  }, [value]);

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
      void getFlowRuns(flowRunsRef.current).then(setValue);
    }, 2_000);

    return () => clearInterval(pollInterval);
  }, [setValue, userAccountId]);

  useEffect(() => {
    if (apiChecked || !userAccountId) {
      return;
    }

    void getFlowRuns(flowRunsRef.current).then((newValue) => {
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
