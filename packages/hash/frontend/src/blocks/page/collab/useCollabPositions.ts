import { useEffect, useState } from "react";
import { CollabPosition } from "@hashintel/hash-shared/collab";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import sleep from "sleep-promise";
import { AbortingPromise, GET } from "./http";
import { collabEnabled } from "../collabEnabled";

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

const useCollabPositionsWhenCollabIsEnabled = (
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
      // eslint-disable-next-line no-constant-condition -- we break this async loop as soon as pageHasChanged
      while (true) {
        try {
          activeRequest = fetchRawPositions({
            accountId,
            pageEntityId,
            poll,
          });
          const positions = JSON.parse(await activeRequest) as CollabPosition[];
          activeRequest = undefined;

          if (pageHasChanged) {
            break;
          }
          setPositionInfo({ accountId, pageEntityId, positions });
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

// Prevents new array ref on each render
const emptyListOfPositions: CollabPosition[] = [];

const useCollabPositionsWhenCollabIsDisabled = (): CollabPosition[] => {
  return emptyListOfPositions;
};

export const useCollabPositions = collabEnabled
  ? useCollabPositionsWhenCollabIsEnabled
  : useCollabPositionsWhenCollabIsDisabled;
