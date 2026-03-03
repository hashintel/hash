import type { EntityUuid } from "@blockprotocol/type-system";
import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";

import type {
  MutationSubmitExternalInputResponseArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import * as Error from "../../error";

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
  const flow = await getFlowRunEntityById({
    flowRunId: flowUuid as EntityUuid,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flow) {
    throw Error.notFound(`Flow with id ${flowUuid} not found`);
  }

  const handle = temporal.workflow.getHandle(flowUuid);

  await handle.signal(externalInputResponseSignal, response);

  return true;
};
