import { Button, ButtonProps } from "@hashintel/hash-design-system";
import { Tooltip } from "@mui/material";

interface Props extends ButtonProps {
  tooltip: string;
}

export const TooltipButton = ({ tooltip, ...props }: Props) => {
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
