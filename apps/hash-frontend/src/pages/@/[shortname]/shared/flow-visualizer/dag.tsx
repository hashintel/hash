import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import { Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { ReactFlowProvider } from "reactflow";

import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { flowSectionBorderRadius, transitionOptions } from "./shared/styles";
import type {
  GroupWithEdgesAndNodes,
  UngroupedEdgesAndNodes,
} from "./shared/types";
import { Swimlane } from "./swimlane";

export const DAG = ({
  groups,
  selectedFlowDefinition,
}: {
  groups: [UngroupedEdgesAndNodes] | GroupWithEdgesAndNodes[];
  selectedFlowDefinition: FlowDefinition<FlowActionDefinitionId>;
}) => {
  const { selectedFlowRun } = useFlowRunsContext();

  return (
    <Stack
      sx={({ palette, transitions }) => ({
        background: palette.common.white,
        border: `1px solid ${palette.gray[selectedFlowRun ? 20 : 30]}`,
        borderRadius: flowSectionBorderRadius,
        "& > :first-of-type": {
          borderTopRightRadius: flowSectionBorderRadius,
          borderTopLeftRadius: flowSectionBorderRadius,
        },
        "& > :last-child": {
          borderBottomRightRadius: flowSectionBorderRadius,
          borderBottomLeftRadius: flowSectionBorderRadius,
        },
        "& > :last-child > :first-of-type": {
          borderBottomLeftRadius: flowSectionBorderRadius,
        },
        flexWrap: "wrap",
        transition: transitions.create("border", transitionOptions),
        width: "fit-content",
      })}
    >
      <Stack
        direction="row"
        sx={{
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          p: 3,
        }}
      >
        {selectedFlowRun ? (
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[60] }}
          >
            Started{" "}
            <strong>
              {selectedFlowRun.flowScheduleId ? "by a schedule" : "manually"}
            </strong>{" "}
            at{" "}
            {format(
              new Date(selectedFlowRun.startedAt),
              "yyyy-MM-dd 'at' h:mm a",
            )}
          </Typography>
        ) : (
          <>
            <Typography
              component="span"
              sx={{ fontSize: 14, fontWeight: 600, mr: 2 }}
            >
              {selectedFlowDefinition.name}
            </Typography>
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 400 }}>
              {selectedFlowDefinition.description}
            </Typography>
          </>
        )}
      </Stack>
      {groups.map(({ group, nodes, edges }) => (
        <ReactFlowProvider key={group?.groupId ?? "single-group-dag"}>
          <Swimlane
            group={group}
            nodes={nodes}
            edges={edges}
            isOnlySwimlane={groups.length === 1}
          />
        </ReactFlowProvider>
      ))}
    </Stack>
  );
};
