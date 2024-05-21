import { getFlowById } from "@local/hash-backend-utils/flows";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import type { EntityUuid } from "@local/hash-subgraph";
import { ApolloError } from "apollo-server-errors";

import type {
  MutationSubmitExternalInputResponseArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";

export const submitExternalInputResponse: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationSubmitExternalInputResponseArgs
> = async (
  _,
  { response, flowUuid },
  { authentication, dataSources, temporal },
) => {
  const flow = await getFlowById({
    flowId: flowUuid as EntityUuid,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flow) {
    throw new ApolloError(`Flow with id ${flowUuid} not found`, "NOT_FOUND");
  }

  const handle = temporal.workflow.getHandle(flowUuid);

  await handle.signal(externalInputResponseSignal, response);

  return true;
};
