import { isUserHashInstanceAdmin } from "@local/hash-backend-utils/hash-instance";
import { getWebServiceUsage } from "@local/hash-backend-utils/service-usage";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";

const usageCostLimit = {
  admin: {
    day: 30,
    month: 150,
  },
  web: {
    day: 10,
    month: 50,
  },
};

export const checkWebServiceUsageNotExceeded = async (params: {
  graphApiClient: GraphApi;
  userAccountId: AccountId;
  webId: OwnedById;
}): Promise<Status<never>> => {
  const { graphApiClient, userAccountId, webId } = params;

  const now = new Date();

  const userAuthenticationInfo = { actorId: userAccountId };

  const webServiceUsage = await getWebServiceUsage(
    { graphApi: graphApiClient },
    {
      decisionTimeInterval: {
        start: {
          kind: "inclusive",
          limit: new Date(
            now.valueOf() - 1000 * 60 * 60 * 24 * 30,
          ).toISOString() as Timestamp,
        },
        end: { kind: "inclusive", limit: now.toISOString() as Timestamp },
      },
      userAccountId,
      webId,
    },
  );

  const { lastDaysCost, lastThirtyDaysCost } = webServiceUsage.reduce(
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
    usageCostLimit[isUserAdmin ? "admin" : "web"];

  const errorPrefix = isUserAdmin
    ? "You have exceeded your admin"
    : "The web has exceeded its";

  if (lastDaysCost >= dayLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `${errorPrefix} daily usage limit of ${dayLimit}.`,
    };
  }

  if (lastThirtyDaysCost >= monthLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `${errorPrefix} monthly usage limit of ${monthLimit}.`,
    };
  }

  return { code: StatusCode.Ok, contents: [] };
};
