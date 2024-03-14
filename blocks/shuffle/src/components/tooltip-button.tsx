import type { ButtonProps } from "@hashintel/design-system";
import { Button } from "@hashintel/design-system";
import { Tooltip } from "@mui/material";

interface TooltipButtonProps extends ButtonProps {
  tooltip: string;
}

export const TooltipButton = ({ tooltip, ...props }: TooltipButtonProps) => {
  return (
    <Tooltip title={tooltip}>
      <Button
        {...props}
        sx={({ palette }) => ({
          border: "1px solid",
          borderColor: palette.primary.light,
          "&:hover": {
            borderColor: palette.primary.main,
          },
        })}
      />
    </Tooltip>
  );
};
