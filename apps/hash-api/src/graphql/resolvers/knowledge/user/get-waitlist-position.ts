import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import type { GetWaitlistPosition200Response } from "@local/internal-api-client";

import type { Query, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";

export const getWaitlistPositionResolver: ResolverFn<
  Query["getWaitlistPosition"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, _args, graphQLContext) => {
  if (isSelfHostedInstance) {
    throw new Error(
      `This functionality is not relevant to self-hosted instances.`,
    );
  }

  const { user } = graphQLContext;

  const email = user.emails[0];

  if (!email) {
    throw new Error("No email address found for user");
  }

  let data: GetWaitlistPosition200Response;

  try {
    ({ data } = await internalApiClient.getWaitlistPosition(email));
  } catch (error) {
    throw new Error("Error fetching waitlist position");
  }

  if (typeof data.waitlistPosition !== "number") {
    throw new TypeError("No waitlist position found for user");
  }

  return data.waitlistPosition;
};
