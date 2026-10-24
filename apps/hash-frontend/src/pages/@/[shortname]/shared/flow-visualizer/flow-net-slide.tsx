import { Backdrop, Box, Slide, Stack } from "@mui/material";

import { IconButton, XMarkRegularIcon } from "@hashintel/design-system";
import { isGoalFlowDefinitionEntityId } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { FlowNetView } from "./flow-net-view";
import { Topbar } from "./topbar";

import type { FlowNetViewRun } from "./flow-net-view";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

type FlowNetSlideProps = {
  open: boolean;
  onClose: () => void;
  selectedFlowDefinition: FlowDefinition<FlowActionDefinitionId>;
  flowDefinitionEntityId: EntityId;
  flowRun: FlowNetViewRun;
};

export const FlowNetSlide = ({
  open,
  onClose,
  selectedFlowDefinition,
  flowDefinitionEntityId,
  flowRun,
}: FlowNetSlideProps) => {
  const isGoal = isGoalFlowDefinitionEntityId(flowDefinitionEntityId);

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
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            background: ({ palette }) => palette.gray[10],
            width: "90vw",
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
          <Box sx={{ flex: 1, minHeight: 0, p: 3 }}>
            <FlowNetView
              flowDefinition={selectedFlowDefinition}
              flowDefinitionEntityId={flowDefinitionEntityId}
              /* A run's events are only read while its net is shown. */
              flowRun={open ? flowRun : undefined}
            />
          </Box>
        </Box>
      </Slide>
    </Backdrop>
  );
};
