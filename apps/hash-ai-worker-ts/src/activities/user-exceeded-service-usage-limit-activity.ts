import { isUserHashInstanceAdmin } from "@local/hash-backend-utils/hash-instance";
import { getUserServiceUsage } from "@local/hash-backend-utils/service-usage";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId, Timestamp } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";

const usageCostLimit = {
  admin: {
    day: 100,
    month: 500,
  },
  user: {
    day: 10,
    month: 50,
  },
};

export const userExceededServiceUsageLimitActivity = async (params: {
  graphApiClient: GraphApi;
  userAccountId: AccountId;
}): Promise<Status<never>> => {
  const { graphApiClient, userAccountId } = params;

  const now = new Date();

  const userAuthenticationInfo = { actorId: userAccountId };

  const userServiceUsage = await getUserServiceUsage(
    { graphApi: graphApiClient },
    userAuthenticationInfo,
    {
      userAccountId,
      decisionTimeInterval: {
        start: {
          kind: "inclusive",
          limit: new Date(
            now.valueOf() - 1000 * 60 * 60 * 24 * 30,
          ).toISOString() as Timestamp,
        },
        end: { kind: "inclusive", limit: now.toISOString() as Timestamp },
      },
    },
  );

  const { lastDaysCost, lastThirtyDaysCost } = userServiceUsage.reduce(
    (acc, usageRecord) => {
      acc.lastDaysCost += usageRecord.last24hoursTotalCostInUsd;
      acc.lastThirtyDaysCost += usageRecord.totalCostInUsd;
      return acc;
    },
    { lastDaysCost: 0, lastThirtyDaysCost: 0 },
  );

  const isUserAdmin = await isUserHashInstanceAdmin(
    { graphApi: graphApiClient },
    userAuthenticationInfo,
    { userAccountId: userAuthenticationInfo.actorId },
  );

  const { day: dayLimit, month: monthLimit } =
    usageCostLimit[isUserAdmin ? "admin" : "user"];

  if (lastDaysCost >= dayLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `You have exceeded your daily usage limit of ${dayLimit}.`,
    };
  }

  if (lastThirtyDaysCost >= monthLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `You have exceeded your monthly usage limit of ${monthLimit}.`,
    };
  }

  return { code: StatusCode.Ok, contents: [] };
};
