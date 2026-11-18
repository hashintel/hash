import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import {
  flowDefinitionIds,
  isHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { EventTable } from "./shared/event-table";
import { HistoryRow } from "./shared/history-row";
import { TableLabel } from "./shared/table-label";

import type { LocalStorage } from "../../../../../shared/storage";

export const AutomaticallyTriggered = ({
  flowRuns: unfilteredFlowRuns,
}: {
  flowRuns: LocalStorage["flowRuns"];
}) => {
  const automaticallyTriggeredFlows = useMemo(
    () =>
      unfilteredFlowRuns.filter((flow) =>
        isHashFlowDefinitionEntityId(
          flow.flowDefinitionEntityId,
          flowDefinitionIds.automaticBrowserInference,
        ),
      ),
    [unfilteredFlowRuns],
  );

  return (
    <>
      <TableLabel type="automatic" />
      <EventTable triggerRow>
        {automaticallyTriggeredFlows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} sx={{ lineHeight: "1.3 !important" }}>
              The status of flows triggered automatically from the plugin will
              appear here.
            </TableCell>
          </TableRow>
        ) : (
          automaticallyTriggeredFlows.map((flow) => (
            <HistoryRow
              flowRun={flow}
              key={flow.flowRunEntityId}
              type="automatic"
            />
          ))
        )}
      </EventTable>
    </>
  );
};
