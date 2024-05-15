import { manualBrowserInferenceFlowDefinition } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { TableCell, TableRow, Typography } from "@mui/material";
import { useMemo } from "react";

import { useFlowRuns } from "../shared/use-flow-runs";
import { TableLabel } from "./shared/table-label";
import { EventTable } from "./shared/event-table";
import { BrowserFlowRow } from "./shared/browser-flow-row";

export const ManuallyTriggered = () => {
  const { browserFlowRuns: unfilteredFlowRuns } = useFlowRuns();

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

            return <BrowserFlowRow flow={flow} key={flowRunId} type="manual" />;
          })
        )}
      </EventTable>
    </>
  );
};
