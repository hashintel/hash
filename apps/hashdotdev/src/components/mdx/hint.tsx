import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningIcon from "@mui/icons-material/Warning";
import { Box } from "@mui/material";
import { FunctionComponent, PropsWithChildren, ReactNode } from "react";

type HintStyle = "success" | "info" | "warning" | "danger";

const hintStyleToIcon: Record<HintStyle, ReactNode> = {
  success: <CheckCircleOutlineIcon />,
  info: <InfoOutlinedIcon />,
  warning: <WarningIcon />,
  danger: <ErrorOutlineIcon />,
};

const hintStyleToClassName: Record<HintStyle, string> = {
  success: "hint-success",
  info: "hint-info",
  warning: "hint-warning",
  danger: "hint-danger",
};

export const Hint: FunctionComponent<
  PropsWithChildren & { style: "success" | "info" | "warning" | "danger" }
> = ({ children, style }) => {
  const icon = hintStyleToIcon[style];
  const className = hintStyleToClassName[style];

  return (
    <Box className="hint">
      <Box className={className}>
        {icon}
        <div className="markdown-wrapper">{children}</div>
      </Box>
    </Box>
  );
};
