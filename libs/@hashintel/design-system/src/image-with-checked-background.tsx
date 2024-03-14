import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";

export const ImageWithCheckedBackground = ({
  sx,
  ...props
}: BoxProps<"img"> & Required<Pick<BoxProps<"img">, "alt" | "src">>) => (
  <Box
    component="img"
    sx={[
      ({ palette }) => ({
        backgroundImage: `linear-gradient(45deg, ${palette.gray[20]} 25%, transparent 25%), linear-gradient(-45deg, ${palette.gray[20]} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${palette.gray[20]} 75%), linear-gradient(-45deg, transparent 75%, ${palette.gray[20]} 75%)`,
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        borderRadius: 1,
        objectFit: "contain",
        width: "100%",
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);
