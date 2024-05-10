import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";

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
> = async (_, { response, flowUuid }, { temporal }) => {
  /** @todo validate that the user can retrieve the flow */

  const handle = temporal.workflow.getHandle(flowUuid);

  await handle.signal(externalInputResponseSignal, response);

  return true;
};
