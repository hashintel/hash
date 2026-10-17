import { TableCell, TableRow } from "@mui/material";
import { useMemo } from "react";

import { generateBrowserInferenceFlowDefinitionEntityId } from "../../../../../shared/browser-inference-flow-definition";
import { EventTable } from "./shared/event-table";
import { HistoryRow } from "./shared/history-row";
import { TableLabel } from "./shared/table-label";

import type { LocalStorage } from "../../../../../shared/storage";
import type { WebId } from "@blockprotocol/type-system";

export const AutomaticallyTriggered = ({
  flowRuns: unfilteredFlowRuns,
  hashWebId,
}: {
  flowRuns: LocalStorage["flowRuns"];
  hashWebId: WebId;
}) => {
  const automaticallyTriggeredFlows = useMemo(() => {
    const flowDefinitionEntityId =
      generateBrowserInferenceFlowDefinitionEntityId({
        hashWebId,
        trigger: "automatic",
      });

    return unfilteredFlowRuns.filter(
      (flow) =>
        flow.flowDefinitionEntityId === flowDefinitionEntityId ||
        flow.requestedPageUrl,
    );
  }, [hashWebId, unfilteredFlowRuns]);

  return (
    <>
      <TableLabel hashWebId={hashWebId} type="automatic" />
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
            const flowRunEntityId = flow.flowRunEntityId;

            return (
              <HistoryRow
                flowRun={flow}
                key={flowRunEntityId}
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
