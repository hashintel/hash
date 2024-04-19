import { Box, Typography } from "@mui/material";
import { Modal } from "../../../shared/ui/modal";
import { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { useState } from "react";
import { OwnedById } from "@local/hash-subgraph";
import { VersionedUrl } from "@blockprotocol/type-system";

type RunFlowModalProps = {
  flowDefinition: FlowDefinition;
  open: boolean;
  onClose: () => void;
};

type TriggerInputValue = VersionedUrl | string | number | OwnedById;

export const RunFlowModal = ({
  flowDefinition,
  open,
  onClose,
}: RunFlowModalProps) => {
  const { outputs } = flowDefinition.trigger;

  const [formState, setFormState] = useState<
    Record<string, TriggerInputValue | TriggerInputValue[]>
  >({});

  return (
    <Modal open={open} onClose={onClose}>
      <>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>Run flow</Typography>
        </Box>
        <Box>
          In order to run the <strong>{flowDefinition.name}</strong> flow,
          you'll need to provide a bit more information first.
        </Box>
      </>
    </Modal>
  );
};
