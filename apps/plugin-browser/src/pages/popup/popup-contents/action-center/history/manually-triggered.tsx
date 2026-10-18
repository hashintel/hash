import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import {
  flowDefinitionIds,
  isHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { EventTable } from "./shared/event-table";
import { HistoryRow } from "./shared/history-row";
import { TableLabel } from "./shared/table-label";

import type { MinimalFlowRun } from "../../../../../shared/storage";

export const ManuallyTriggered = ({
  flowRuns: unfilteredFlowRuns,
}: {
  flowRuns: MinimalFlowRun[];
}) => {
  const manuallyTriggeredFlows = useMemo(
    () =>
      unfilteredFlowRuns.filter((flow) =>
        isHashFlowDefinitionEntityId(
          flow.flowDefinitionEntityId,
          flowDefinitionIds.manualBrowserInference,
        ),
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
            const flowRunEntityId = flow.flowRunEntityId;

            return (
              <HistoryRow flowRun={flow} key={flowRunEntityId} type="manual" />
            );
          })
        )}
      </EventTable>
    </>
  );
};
