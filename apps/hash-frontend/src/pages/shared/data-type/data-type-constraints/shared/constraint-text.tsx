import type { DataType } from "@blockprotocol/type-system";
import { Box, Tooltip } from "@mui/material";

export const ConstraintText = ({
  text,
  from,
}: { text: string; from?: DataType }) => {
  if (from) {
    return (
      <Tooltip title={<Box>Inherited from {from.title}</Box>}>
        <Box component="span" sx={{ fontWeight: 500, cursor: "help" }}>
          {text}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box component="span" sx={{ fontWeight: 500 }}>
      {text}
    </Box>
  );
};
