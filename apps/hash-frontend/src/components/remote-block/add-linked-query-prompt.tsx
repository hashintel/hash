import { Box, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { useBlockContext } from "../../pages/shared/block-collection/block-context";
import { Button } from "../../shared/ui";

export const AddLinkedQueryPrompt: FunctionComponent<{
  blockIconSrc?: string;
  blockName: string;
}> = ({ blockIconSrc, blockName }) => {
  const { setBlockSelectDataModalIsOpen } = useBlockContext();

  return (
    <Box
      sx={{
        borderColor: ({ palette }) => palette.gray[30],
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: "10px",
        padding: ({ spacing }) => spacing(3.5, 4),
        background: ({ palette }) => palette.gray[10],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {blockIconSrc ? (
        <Box
          component="img"
          sx={{
            height: 42,
            width: 42,
            marginBottom: 1,
          }}
          src={blockIconSrc}
        />
      ) : null}
      <Typography gutterBottom textAlign="center">
        The <strong>{blockName.toLowerCase()} block</strong> needs to know what
        information to display
      </Typography>
      <Button
        variant="tertiary"
        onClick={() => setBlockSelectDataModalIsOpen(true)}
        size="small"
      >
        Click here to select data
      </Button>
    </Box>
  );
};
