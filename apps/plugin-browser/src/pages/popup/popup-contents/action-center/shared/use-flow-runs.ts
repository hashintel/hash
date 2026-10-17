import { useEffect, useMemo, useState } from "react";

import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { getMinimalFlowRunsQuery } from "../../../../../graphql/queries/flow.queries";
import { generateBrowserInferenceFlowDefinitionEntityId } from "../../../../../shared/browser-inference-flow-definition";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import { useUserContext } from "../../shared/user-context";

import type {
  GetMinimalFlowRunsQuery,
  GetMinimalFlowRunsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type {
  FlowFromBrowserOrWithPageRequest,
  LocalStorage,
  MinimalFlowRun,
} from "../../../../../shared/storage";
import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";
import type {
  AutomaticInferenceInputName,
  AutomaticInferenceInputs,
  browserInferenceFlowOutput,
  ManualInferenceInputName,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { PayloadKindValues } from "@local/hash-isomorphic-utils/flows/types";

const mapFlowRunToMinimalFlowRun = (
  flowRun: GetMinimalFlowRunsQuery["getFlowRuns"]["flowRuns"][number],
): MinimalFlowRun => {
  const persistedEntities = (flowRun.outputs ?? []).flatMap((output) =>
    (output.contents[0]?.outputs ?? []).flatMap(({ outputName, payload }) => {
      if (
        outputName ===
        ("persistedEntities" satisfies (typeof browserInferenceFlowOutput)["name"])
      ) {
        /**
         * The GraphQL layer resolves StoredPayloadRef values before returning them to clients,
         * so payload.value is the actual resolved value at runtime, not a StoredPayloadRef.
         * The type system includes StoredPayloadRef as a possible value type, but by the time
         * the response reaches the browser, these have been resolved.
         * @see libs/@local/hash-backend-utils/src/flows/get-flow-run-details.ts
         *
         * Runs from before the output became an array have a single object here instead, and show no entities.
         */
        return Array.isArray(payload.value)
          ? (payload.value as PayloadKindValues[(typeof browserInferenceFlowOutput)["payloadKind"]][])
          : [];
      }
      return [];
    }),
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

const getFlowRuns = async ({
  hashWebId,
  userAccountId,
}: {
  hashWebId: WebId;
  userAccountId: ActorEntityUuid;
}): Promise<FlowFromBrowserOrWithPageRequest[]> =>
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
      const browserInferenceFlowDefinitionEntityIds = [
        generateBrowserInferenceFlowDefinitionEntityId({
          hashWebId,
          trigger: "manual",
        }),
        generateBrowserInferenceFlowDefinitionEntityId({
          hashWebId,
          trigger: "automatic",
        }),
      ];

      const flowRunsOfInterest: LocalStorage["flowRuns"] = [];

      for (const flowRun of unfilteredFlowRuns) {
        if (
          browserInferenceFlowDefinitionEntityIds.includes(
            flowRun.flowDefinitionEntityId,
          )
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

  const hashWebId = user?.hashWebId;

  useEffect(() => {
    if (!userAccountId || !hashWebId) {
      return;
    }

    const pollInterval = setInterval(() => {
      void getFlowRuns({ hashWebId, userAccountId }).then(setValue);
    }, 2_000);

    return () => clearInterval(pollInterval);
  }, [hashWebId, setValue, userAccountId]);

  useEffect(() => {
    if (apiChecked || !userAccountId || !hashWebId) {
      return;
    }

    void getFlowRuns({ hashWebId, userAccountId }).then((newValue) => {
      setValue(newValue);
      setApiChecked(true);
    });

    setApiChecked(true);
  }, [apiChecked, hashWebId, setValue, userAccountId]);

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
