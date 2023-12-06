import { Box } from "@mui/material";

import { LocalStorage } from "../../../../shared/storage";
import { InferenceRequests } from "./log/inference-requests";
import { Section } from "./shared/section";

export const Log = ({ user }: { user: NonNullable<LocalStorage["user"]> }) => {
  return (
    <Box>
      <Section headerText="Event history" />
      <InferenceRequests user={user} />
    </Box>
  );
};
