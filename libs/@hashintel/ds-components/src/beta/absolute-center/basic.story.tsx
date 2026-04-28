import { Box } from "@hashintel/ds-helpers/jsx";

import { AbsoluteCenter } from "./absolute-center";

export const App = () => {
  return (
    <Box position="relative" height="40">
      <AbsoluteCenter>
        <Box bg="gray.surface.bg" p="4" borderRadius="l2" boxShadow="md">
          Centered Content
        </Box>
      </AbsoluteCenter>
    </Box>
  );
};
