import type {
  ResearchTaskWorkflowParams,
  ResearchTaskWorkflowResponse,
} from "@local/hash-isomorphic-utils/research-task-types";
import { OwnedById } from "@local/hash-subgraph";

import { genId } from "../../../util";
import { MutationStartResearchTaskArgs, ResolverFn } from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const startResearchTaskResolver: ResolverFn<
  Promise<ResearchTaskWorkflowResponse>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationStartResearchTaskArgs
> = async (_, { prompt, entityTypeIds }, graphQLContext) => {
  const { temporal, user } = graphQLContext;

  const workflowResponse = await temporal.workflow.execute<
    (
      params: ResearchTaskWorkflowParams,
    ) => Promise<ResearchTaskWorkflowResponse>
  >("researchTask", {
    taskQueue: "ai",
    args: [
      {
        prompt,
        entityTypeIds,
        userAuthentication: { actorId: user.accountId },
        webOwnerId: user.accountId as OwnedById,
      },
    ],
    workflowId: genId(),
    retry: {
      maximumAttempts: 1,
    },
  });

  return workflowResponse;
};
