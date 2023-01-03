import { CollabPosition } from "@hashintel/hash-shared/collab";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import { sleep } from "@hashintel/hash-shared/sleep";
import { useEffect, useState } from "react";

import { AbortingPromise, GET } from "./http";

const requestRetryInterval = 5000;

interface GetPositionsPayload {
  accountId: string;
  pageEntityId: string;
  poll?: boolean;
}

const fetchRawPositions = ({
  accountId,
  pageEntityId,
  poll,
}: GetPositionsPayload): AbortingPromise<string> =>
  GET(
    `${apiOrigin}/collab-backend/${accountId}/${pageEntityId}/positions${
      poll ? "?poll=true" : ""
    }`,
  );

// If we switch pages without component remounting, the hook will be returning
// stale page positions for a short period of time. To avoid this problem and
// to minimise re-renders due to state changes, we group positions with page
// coordinates and leverage useEffect() to re-fetch the data. If last known
// positions don’t match hook args, we return an empty array while refetching.

interface PositionInfo {
  accountId: string;
  pageEntityId: string;
  positions: CollabPosition[];
}

export const useCollabPositions = (
  accountId: string,
  pageEntityId: string,
): CollabPosition[] => {
  const [positionInfo, setPositionInfo] = useState<PositionInfo>({
    accountId,
    pageEntityId,
    positions: [],
  });

  useEffect(() => {
    let pageHasChanged = false;
    let activeRequest: AbortingPromise<string> | undefined = undefined;
    void (async () => {
      let poll = false;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- we break this async loop as soon as pageHasChanged
      while (true) {
        try {
          activeRequest = fetchRawPositions({
            accountId,
            pageEntityId,
            poll,
          });
          const response = await activeRequest;
          const positions =
            // Check for no content
            response !== ""
              ? (JSON.parse(response) as CollabPosition[])
              : undefined;

          activeRequest = undefined;

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
          if (pageHasChanged) {
            break;
          }

          if (positions) {
            setPositionInfo({ accountId, pageEntityId, positions });
          }
          poll = true;
        } catch (error) {
          await sleep(requestRetryInterval);
        }
      }
    })();

    return () => {
      pageHasChanged = true;
      if (activeRequest) {
        activeRequest.abort();
      }
    };
  }, [accountId, pageEntityId]);

  return positionInfo.accountId === accountId &&
    positionInfo.pageEntityId === pageEntityId
    ? positionInfo.positions
    : [];
};
