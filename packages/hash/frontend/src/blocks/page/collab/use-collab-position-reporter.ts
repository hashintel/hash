import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { useCallback, useEffect, useRef } from "react";

import { POST } from "./http";

export type CollabPositionReporter = (entityId: string | null) => void;

const heartbeatInterval = 1000 * 20;
const requestRetryInterval = 5000;

const sendCollabPosition = ({
  accountId,
  pageEntityId,
  entityId,
}: {
  accountId: string;
  pageEntityId: string;
  entityId: string | null;
}) => {
  return POST(
    `${apiOrigin}/collab-backend/${accountId}/${pageEntityId}/report-position`,
    JSON.stringify({ entityId }),
    "application/json",
  );
};

// As we don’t need to display reported block id to ourselves, we can avoid useState()
// and thus reduce the number of re-renders. Each time we change to a new page,
// we redefine reportWithHeartbeatRef, while keeping outer function ref stable.

export const useCollabPositionReporter = (
  accountId: string,
  pageEntityId: string,
): CollabPositionReporter => {
  const reportWithHeartbeatRef = useRef<CollabPositionReporter>(() => {});

  const reportPosition = useCallback((entityId: string | null) => {
    reportWithHeartbeatRef.current(entityId);
  }, []);

  useEffect(() => {
    let pageBlockId: string | null = null;
    let pageHasChanged = false;

    reportWithHeartbeatRef.current = (entityId) => {
      if (pageHasChanged || pageBlockId === entityId) {
        return;
      }

      pageBlockId = entityId;

      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
        while (!pageHasChanged && pageBlockId === entityId) {
          try {
            await sendCollabPosition({
              accountId,
              pageEntityId,
              entityId,
            });

            if (!entityId) {
              return; // No need to send hearbeats when a block is not selected
            }

            await sleep(heartbeatInterval);
          } catch {
            // TODO: report failed requests to sentry?
            await sleep(requestRetryInterval);
          }
        }
      })();
    };

    return () => {
      pageHasChanged = true;
      if (pageBlockId) {
        void sendCollabPosition({ accountId, pageEntityId, entityId: null });
      }
    };
  }, [pageEntityId, accountId]);

  return reportPosition;
};
