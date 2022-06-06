import {
  Box,
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  useTheme,
} from "@mui/material";
import * as React from "react";
import { LoadingSpinner } from "./loading-spinner";

export type ButtonProps = {
  children: React.ReactNode;
  loading?: boolean;
  loadingWithoutText?: boolean;
  disabledTooltipText?: string;
} & MuiButtonProps & { rel?: string; target?: string }; // MUI button renders <a /> when href is provided, but typings miss rel and target

const LoadingContent: React.VFC<{
  withText: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
}> = ({ withText, size, variant = "primary" }) => {
  const theme = useTheme();

  const spinnerSize = React.useMemo(() => {
    switch (size) {
      case "large":
        return 20;
      case "medium":
        return 16;
      case "xs":
        return 12;
      default:
        return 16;
    }
  }, [size]);

  const spinnerColor = React.useMemo(() => {
    switch (variant) {
      case "tertiary":
      case "tertiary_quiet":
        return theme.palette.gray[50];
      default:
        return "currentColor";
    }
  }, [theme, variant]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
      }}
    >
      <LoadingSpinner color={spinnerColor} size={spinnerSize} thickness={4} />

      {withText && (
        <Box
          component="span"
          sx={{
            ml: "12px",
            ...(size === "xs" && { ml: "8px" }),
          }}
        >
          Loading...
        </Box>
      )}
    </Box>
  );
};

export const Button: React.VFC<ButtonProps> = React.forwardRef(
  ({ children, loading, loadingWithoutText, sx = [], ...props }, ref) => {
    return (
      <MuiButton
        sx={[
          {
            pointerEvents: loading ? "none" : "auto",
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...props}
        ref={ref}
      >
        {loading ? (
          <LoadingContent
            withText={!loadingWithoutText}
            size={props.size}
            variant={props.variant}
          />
        ) : (
          children
        )}
      </MuiButton>
    );
  },
);
