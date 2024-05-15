import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import { useFlowRuns } from "../shared/use-flow-runs";
import { TableLabel } from "./shared/table-label";
import { EventTable } from "./shared/event-table";
import { BrowserFlowRow } from "./shared/browser-flow-row";

export const AutomaticallyTriggered = () => {
  const { browserFlowRuns: unfilteredFlowRuns } = useFlowRuns();

  const automaticallyTriggeredFlows = useMemo(
    () =>
      unfilteredFlowRuns.filter(
        (flow) =>
          flow.flowDefinitionId ===
          automaticBrowserInferenceFlowDefinition.flowDefinitionId,
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
              The status of flows triggered automatically from the plugin and
              requests for webpages from flows to the plugin will appear here.
            </TableCell>
          </TableRow>
        ) : (
          automaticallyTriggeredFlows.map((flow) => {
            const flowRunId = flow.flowRunId;

            return (
              <BrowserFlowRow flow={flow} key={flowRunId} type="automatic" />
            );
          })
        )}
      </EventTable>
    </>
  );
};
