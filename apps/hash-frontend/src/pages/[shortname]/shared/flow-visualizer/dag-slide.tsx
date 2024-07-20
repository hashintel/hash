import { IconButton } from "@hashintel/design-system";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { Backdrop, Box, Slide, Stack } from "@mui/material";

import { XMarkRegularIcon } from "../../../../shared/icons/x-mark-regular-icon";

import { DAG } from "./dag";
import type {
  GroupWithEdgesAndNodes,
  UngroupedEdgesAndNodes,
} from "./shared/types";
import { Topbar } from "./topbar";

interface DagSlideProps {
  groups: [UngroupedEdgesAndNodes] | GroupWithEdgesAndNodes[];
  open: boolean;
  onClose: () => void;
  selectedFlowDefinition: FlowDefinition;
}

export const DagSlide = ({
  groups,
  open,
  onClose,
  selectedFlowDefinition,
}: DagSlideProps) => {
  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: ({ zIndex }) => zIndex.drawer + 2,
        justifyContent: "flex-end",
      }}
      onClick={() => { onClose(); }}
    >
      <Slide
        in={open}
        direction={"left"}
        onClick={(event) => { event.stopPropagation(); }}
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
            direction={"row"}
            alignItems={"center"}
            justifyContent={"space-between"}
            sx={{ background: ({ palette }) => palette.common.white }}
          >
            <Topbar
              readonly
              handleRunFlowClicked={() => null}
              showRunButton={false}
            />
            <IconButton
              sx={{ "& svg": { fontSize: 18 }, mr: 2.5, p: 0.5 }}
              onClick={onClose}
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
