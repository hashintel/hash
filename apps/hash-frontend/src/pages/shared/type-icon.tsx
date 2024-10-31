import { AsteriskRegularIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";

export const TypeIcon = ({
  fill,
  fontSize,
  icon,
}: {
  fill?: string;
  fontSize: number;
  icon?: string | null;
}) => {
  if (!icon) {
    return <AsteriskRegularIcon sx={{ fill, fontSize }} />;
  }
  if (
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("/")
  ) {
    return (
      <Box
        sx={({ palette }) => ({
          backgroundColor: fill ?? palette.common.black,
          "-webkit-mask": `url(${icon}) no-repeat center / contain`,
          mask: `url(${icon}) no-repeat center / contain`,
          width: fontSize,
          height: fontSize,
        })}
      />
    );
  }

  return icon;
};
