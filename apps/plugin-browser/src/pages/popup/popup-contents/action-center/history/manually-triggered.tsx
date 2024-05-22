import { manualBrowserInferenceFlowDefinition } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import type { MinimalFlowRun } from "../../../../../shared/storage";
import { EventTable } from "./shared/event-table";
import { HistoryRow } from "./shared/history-row";
import { TableLabel } from "./shared/table-label";

export const ManuallyTriggered = ({
  browserFlowRuns: unfilteredFlowRuns,
}: {
  browserFlowRuns: MinimalFlowRun[];
}) => {
  const manuallyTriggeredFlows = useMemo(
    () =>
      unfilteredFlowRuns.filter(
        (flow) =>
          flow.flowDefinitionId ===
          manualBrowserInferenceFlowDefinition.flowDefinitionId,
      ),
    [unfilteredFlowRuns],
  );

  return (
    <>
      <TableLabel type="manual" />
      <EventTable triggerRow={false}>
        {manuallyTriggeredFlows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3}>
              The status of flows you trigger manually from the plugin will
              appear here.
            </TableCell>
          </TableRow>
        ) : (
          manuallyTriggeredFlows.map((flow) => {
            const flowRunId = flow.flowRunId;

            return <HistoryRow flowRun={flow} key={flowRunId} type="manual" />;
          })
        )}
      </EventTable>
    </>
  );
};
