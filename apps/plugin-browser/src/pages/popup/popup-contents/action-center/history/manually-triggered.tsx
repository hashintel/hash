import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import { generateBrowserInferenceFlowDefinitionEntityId } from "../../../../../shared/browser-inference-flow-definition";
import { EventTable } from "./shared/event-table";
import { HistoryRow } from "./shared/history-row";
import { TableLabel } from "./shared/table-label";

import type { MinimalFlowRun } from "../../../../../shared/storage";
import type { WebId } from "@blockprotocol/type-system";

export const ManuallyTriggered = ({
  flowRuns: unfilteredFlowRuns,
  hashWebId,
}: {
  flowRuns: MinimalFlowRun[];
  hashWebId: WebId;
}) => {
  const manuallyTriggeredFlows = useMemo(() => {
    const flowDefinitionEntityId =
      generateBrowserInferenceFlowDefinitionEntityId({
        hashWebId,
        trigger: "manual",
      });

    return unfilteredFlowRuns.filter(
      (flow) => flow.flowDefinitionEntityId === flowDefinitionEntityId,
    );
  }, [hashWebId, unfilteredFlowRuns]);

  return (
    <>
      <TableLabel hashWebId={hashWebId} type="manual" />
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
