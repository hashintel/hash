import { MinimalFlowRun } from "../../../../../../../shared/storage";
import { Box, TableCell } from "@mui/material";
import { useEffect, useState } from "react";
import { formatDuration, intervalToDuration } from "date-fns";

const generateDurationString = (interval: Interval) =>
  formatDuration(intervalToDuration(interval));

export const FlowMetadataCellContents = ({
  flow,
}: {
  flow: MinimalFlowRun;
}) => {
  const [timeElapsed, setTimeElapsed] = useState(() =>
    flow.executedAt
      ? generateDurationString({
          start: new Date(flow.executedAt),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
          end: new Date(flow.closedAt || Date.now()),
        })
      : "Pending...",
  );

  useEffect(() => {
    if (flow.executedAt && !flow.closedAt) {
      setTimeout(() => {
        setTimeElapsed(
          generateDurationString({
            start: new Date(flow.executedAt!),
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
            end: new Date(flow.closedAt || Date.now()),
          }),
        );
      }, 1_000);
    }
  });

  return <Box p="10px 16px">{timeElapsed}</Box>;
};
