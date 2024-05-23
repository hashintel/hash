import { automaticBrowserInferenceFlowDefinition } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import type { LocalStorage } from "../../../../../shared/storage";
import { EventTable } from "./shared/event-table";
import { HistoryRow } from "./shared/history-row";
import { TableLabel } from "./shared/table-label";

export const AutomaticallyTriggered = ({
  flowRuns: unfilteredFlowRuns,
}: {
  flowRuns: LocalStorage["flowRuns"];
}) => {
  const automaticallyTriggeredFlows = useMemo(
    () =>
      unfilteredFlowRuns.filter(
        (flow) =>
          flow.flowDefinitionId ===
            automaticBrowserInferenceFlowDefinition.flowDefinitionId ||
          flow.requestedPageUrl,
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
              <HistoryRow
                flowRun={flow}
                key={flowRunId}
                type={
                  flow.requestedPageUrl ? "external-page-request" : "automatic"
                }
              />
            );
          })
        )}
      </EventTable>
    </>
  );
};
