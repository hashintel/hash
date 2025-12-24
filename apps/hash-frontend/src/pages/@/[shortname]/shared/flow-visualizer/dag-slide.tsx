import { IconButton, XMarkRegularIcon } from "@hashintel/design-system";
import { goalFlowDefinitionIds } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import { Backdrop, Box, Slide, Stack } from "@mui/material";

import { DAG } from "./dag";
import type {
  GroupWithEdgesAndNodes,
  UngroupedEdgesAndNodes,
} from "./shared/types";
import { Topbar } from "./topbar";

type DagSlideProps = {
  groups: [UngroupedEdgesAndNodes] | GroupWithEdgesAndNodes[];
  open: boolean;
  onClose: () => void;
  selectedFlowDefinition: FlowDefinition<FlowActionDefinitionId>;
};

export const DagSlide = ({
  groups,
  open,
  onClose,
  selectedFlowDefinition,
}: DagSlideProps) => {
  const isGoal = goalFlowDefinitionIds.includes(
    selectedFlowDefinition.flowDefinitionId,
  );

  return (
    <Backdrop
      open={open}
      onClick={() => onClose()}
      sx={{
        zIndex: ({ zIndex }) => zIndex.drawer + 2,
        justifyContent: "flex-end",
      }}
    >
      <Slide
        in={open}
        direction="left"
        onClick={(event) => event.stopPropagation()}
      >
        <Box
          sx={{
            height: "100vh",
            overflow: "auto",
            background: ({ palette }) => palette.gray[10],
            maxWidth: { xs: "90%", md: 800, lg: 1100 },
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ background: ({ palette }) => palette.common.white }}
          >
            <Topbar
              handleRunFlowClicked={() => null}
              showRunButton={false}
              startFlowPending={false}
              readonly
              workerType={isGoal ? "goal" : "flow"}
            />
            <IconButton
              onClick={onClose}
              sx={{ "& svg": { fontSize: 18 }, mr: 2.5, p: 0.5 }}
            >
              <XMarkRegularIcon sx={{ fontSize: 22 }} />
            </IconButton>
          </Stack>
          <Box p={3}>
            <DAG
              groups={groups}
              selectedFlowDefinition={selectedFlowDefinition}
            />
          </Box>
        </Box>
      </Slide>
    </Backdrop>
  );
};
