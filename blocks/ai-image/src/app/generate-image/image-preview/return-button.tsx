import { Button } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { ArrowLeftIcon } from "../../../icons/arrow-left";

export const ReturnButton = ({ onCancel }: { onCancel: () => void }) => {
  return (
    <Box>
      <Button
        variant="tertiary"
        size="small"
        onClick={() => onCancel()}
        sx={({ palette }) => ({
          gap: 1,
          borderRadius: 1,
          fontSize: 14,
          fontWeight: 500,
          lineHeight: "18px",
          color: palette.gray[70],
          fill: palette.gray[50],

          ":hover": {
            fill: palette.gray[80],
          },
        })}
      >
        <ArrowLeftIcon
          sx={{
            fontSize: 16,
            fill: "inherit",
          }}
        />
        Return to options
      </Button>
    </Box>
  );
};
