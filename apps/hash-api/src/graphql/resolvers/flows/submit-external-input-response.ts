import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";

import * as Error from "../../error";

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
  { response, flowRunEntityId },
  { authentication, dataSources, temporal },
) => {
  const flow = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flow) {
    throw Error.notFound(`Flow with id ${flowRunEntityId} not found`);
  }

  const workflowId =
    flow.properties["https://hash.ai/@h/types/property-type/workflow-id/"];

  const handle = temporal.workflow.getHandle(workflowId);

  await handle.signal(externalInputResponseSignal, response);

  return true;
};
