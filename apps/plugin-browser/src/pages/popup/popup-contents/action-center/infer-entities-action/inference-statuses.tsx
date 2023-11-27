import { Box } from "@mui/material";
import { useState } from "react";

import { useSessionStorage } from "../../../../shared/use-storage-sync";
import { InferenceStatus } from "./inference-status";

export const InferenceStatuses = () => {
  const [expandedStatusUuids, setExpandedStatusUuids] = useState<string>([]);
  const [inferenceStatus] = useSessionStorage("inferenceStatus", []);

  return (
    <Box>
      {inferenceStatus.map((status) => (
        <InferenceStatus key={status.localRequestUuid} status={status} />
      ))}
    </Box>
  );
};
