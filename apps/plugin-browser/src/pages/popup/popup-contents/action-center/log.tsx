import { Box } from "@mui/material";

import type { LocalStorage } from "../../../../shared/storage";
import { InferenceRequests } from "./log/inference-requests";
import { Section } from "./shared/section";

export const Log = ({
  inferenceRequests,
  user,
}: {
  inferenceRequests: LocalStorage["inferenceRequests"];
  user: NonNullable<LocalStorage["user"]>;
}) => {
  return (
    <Box>
      <Section headerText="Event history">
        <InferenceRequests inferenceRequests={inferenceRequests} user={user} />
      </Section>
    </Box>
  );
};
