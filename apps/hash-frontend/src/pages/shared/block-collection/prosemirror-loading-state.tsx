import { Box } from "@mui/material";

import { BlockLoadingIndicator } from "../../../components/remote-block/remote-block";

export const ProsemirrorLoadingState = () => {
  return (
    <Box mt={3.75}>
      {[1, 2, 3].map((num) => (
        <BlockLoadingIndicator
          key={num}
          sx={{
            /**
             * 30px is space between blocks
             * @see https://github.com/hashintel/hash/blob/ea0dacf87b6a120986081803a541cdb27ff85b02/packages/hash/frontend/src/blocks/page/style.module.css#L22
             */
            mb: "30px",
          }}
        />
      ))}
    </Box>
  );
};
