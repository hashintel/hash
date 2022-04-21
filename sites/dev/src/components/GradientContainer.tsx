import { Box } from "@mui/material";
import { BoxProps } from "@mui/system";
import { FC } from "react";

export const GradientContainer: FC<BoxProps> = ({
  children,
  sx = [],
  ...props
}) => (
  <Box
    component="section"
    py={16}
    sx={[
      {
        position: "relative",
        "&:before": {
          content: `""`,
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
          backgroundImage: `
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0) 0%,
            rgb(255, 255, 255, 1) 90%
          ),
          linear-gradient(
            25deg,
            hsl(0deg 0% 100%) 0%,
            hsl(197deg 100% 94%) 31%,
            hsl(196deg 100% 88%) 47%,
            hsl(196deg 100% 82%) 58%,
            hsl(198deg 100% 74%) 66%,
            hsl(201deg 100% 67%) 73%,
            hsl(206deg 100% 63%) 78%,
            hsl(211deg 100% 61%) 82%,
            hsl(217deg 100% 61%) 85%,
            hsl(230deg 100% 65%) 89%,
            hsl(252deg 95% 64%) 97%
          );
        `,
          width: "100%",
          height: 400,
          zIndex: -1,
        },
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  >
    {children}
  </Box>
);
