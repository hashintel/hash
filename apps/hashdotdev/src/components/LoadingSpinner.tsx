import { Box, CircularProgress, circularProgressClasses } from "@mui/material";
import { FunctionComponent } from "react";

const DEFAULT_THICKNESS = 5;
const DEFAULT_SIZE = 20;

type LoadingSpinnerProps = {
  size?: number;
  thickness?: number;
  color?: string;
};

export const LoadingSpinner: FunctionComponent<LoadingSpinnerProps> = ({
  size = DEFAULT_SIZE,
  thickness = DEFAULT_THICKNESS,
  color = "currentColor",
}) => {
  return (
    <Box position="relative" height={size} width={size}>
      <CircularProgress
        variant="determinate"
        sx={{
          opacity: 0.2,
          color,
          position: "absolute",
          top: 0,
          left: 0,
        }}
        size={size}
        thickness={thickness}
        value={100}
      />
      <CircularProgress
        variant="indeterminate"
        disableShrink
        sx={{
          color,
          animationDuration: "750ms",
          position: "absolute",
          top: 0,
          left: 0,
          [`& .${circularProgressClasses.circle}`]: {
            strokeLinecap: "round",
          },
        }}
        size={size}
        thickness={thickness}
      />
    </Box>
  );
};
