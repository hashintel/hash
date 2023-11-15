import { Box, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { useBlockContext } from "../../pages/shared/block-collection/block-context";

export const AddLinkedQueryPrompt: FunctionComponent<{ blockName: string }> = ({
  blockName,
}) => {
  const { setBlockQueryEditorIsOpen } = useBlockContext();
  return (
    <Box
      onClick={() => setBlockQueryEditorIsOpen(true)}
      sx={{
        "&:hover": {
          cursor: "pointer",
        },
      }}
    >
      <Typography gutterBottom textAlign="center">
        No data has been selected.
      </Typography>
      <Typography textAlign="center">
        Click here to choose which data to display in this{" "}
        {blockName.toLowerCase()} block.
      </Typography>
    </Box>
  );
};
