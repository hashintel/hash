import { Button } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { SquareDashedCirclePlusIcon } from "../../../icons/square-dashed-circle-plus";

export const CTAButton = ({ onSubmit }: { onSubmit: () => void }) => {
  return (
    <Box>
      <Button
        size="small"
        onClick={() => onSubmit()}
        sx={{
          gap: 1,
          borderRadius: 1,
          fontSize: 14,
          fontWeight: 500,
          lineHeight: "18px",
        }}
      >
        Insert this image
        <SquareDashedCirclePlusIcon
          sx={{
            fontSize: 16,
          }}
        />
      </Button>
    </Box>
  );
};
