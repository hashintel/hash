import { Box, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { useBlockContext } from "../../pages/shared/block-collection/block-context";
import { Button } from "../../shared/ui";

export const AddLinkedQueryPrompt: FunctionComponent<{ blockName: string }> = ({
  blockName,
}) => {
  const { setBlockQueryEditorIsOpen } = useBlockContext();
  return (
    <Box>
      <Typography gutterBottom>
        The "{blockName}" block requires data to be selected.
      </Typography>
      <Button size="xs" onClick={() => setBlockQueryEditorIsOpen(true)}>
        Select data
      </Button>
    </Box>
  );
};
