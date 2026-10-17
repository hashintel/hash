import { getWebByShortname } from "@local/hash-graph-sdk/principal/web";

import type { MachineId, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

let hashWebId: WebId | undefined;

/**
 * The id of the `h` web, which HASH's own flow definitions are in. It differs on every instance, and never changes
 * on one, so it's looked up once, as the web's system machine, which can always see it.
 */
export const getHashWebId = async (
  graphApiClient: GraphApi,
): Promise<WebId> => {
  if (!hashWebId) {
    const systemMachineId = await graphApiClient
      .getOrCreateSystemMachine("h")
      .then(({ data }) => data as MachineId);

    const web = await getWebByShortname(
      graphApiClient,
      { actorId: systemMachineId },
      "h",
    );

    if (!web) {
      throw new Error("There is no web with shortname h");
    }

    hashWebId = web.id;
  }

  return hashWebId;
};
