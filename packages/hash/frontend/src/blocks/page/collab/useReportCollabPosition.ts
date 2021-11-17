import { useEffect, useRef, useCallback } from "react";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import sleep from "sleep-promise";
import { POST } from "./http";
import { collabEnabled } from "../collabEnabled";

type ReportPosition = (blockId: string | undefined) => void;

const heartbeatInterval = 1000 * 20;
const requestRetryInterval = 5000;

const sendPositionToCollabBackend = ({
  accountId,
  pageEntityId,
  blockId,
}: {
  accountId: string;
  pageEntityId: string;
  blockId?: string;
}) => {
  return POST(
    `${apiOrigin}/collab-backend/${accountId}/${pageEntityId}/report-position`,
    JSON.stringify(blockId ? { blockId } : {}),
    "application/json",
  );
};

// As we don’t need to display reported block id to ourselves, we can avoid useState()
// and thus reduce the number of re-renders. Each time we change to a new page,
// we redefine reportWithHeartbeatRef, while keeping outer function ref stable.

const useReportCollabPositionWhenCollabIsEnabled = (
  accountId: string,
  pageEntityId: string,
): ReportPosition => {
  const reportWithHeartbeatRef = useRef<ReportPosition>(() => {});

  const reportPosition = useCallback((blockId) => {
    reportWithHeartbeatRef.current(blockId);
  }, []);

  useEffect(() => {
    let pageBlockId: string | undefined = undefined;
    let pageHasChanged = false;

    reportWithHeartbeatRef.current = (blockId) => {
      if (pageHasChanged || pageBlockId === blockId) {
        return;
      }

      pageBlockId = blockId;

      void (async () => {
        while (!pageHasChanged && pageBlockId === blockId) {
          try {
            await sendPositionToCollabBackend({
              accountId,
              pageEntityId,
              blockId,
            });

            if (!blockId) {
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
        void sendPositionToCollabBackend({ accountId, pageEntityId });
      }
    };
  }, [pageEntityId, accountId]);

  return reportPosition;
};

// Prevents new function ref on each render without involving useCallback
const noop = () => {};

const useReportCollabPositionWhenCollabIsDisabled = (): ReportPosition => {
  return noop;
};

export const useReportCollabPosition = collabEnabled
  ? useReportCollabPositionWhenCollabIsEnabled
  : useReportCollabPositionWhenCollabIsDisabled;
