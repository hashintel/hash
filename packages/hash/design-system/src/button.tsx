import {
  Box,
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  useTheme,
} from "@mui/material";
import {
  forwardRef,
  ForwardRefRenderFunction,
  FunctionComponent,
  ReactNode,
  useMemo,
} from "react";

import { LoadingSpinner } from "./loading-spinner";

export type ButtonProps = {
  children: ReactNode;
  loading?: boolean;
  loadingText?: string;
  loadingWithoutText?: boolean;
  disabledTooltipText?: string;
} & MuiButtonProps & { rel?: string; target?: string }; // MUI button renders <a /> when href is provided, but typings miss rel and target

const LoadingContent: FunctionComponent<{
  withText: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
  loadingText?: string;
}> = ({ withText, size, variant = "primary", loadingText }) => {
  const theme = useTheme();

  const spinnerSize = useMemo(() => {
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

  const spinnerColor = useMemo(() => {
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
          {loadingText ?? "Loading..."}
        </Box>
      )}
    </Box>
  );
};

const Button: ForwardRefRenderFunction<HTMLButtonElement, ButtonProps> = (
  { children, loading, loadingText, loadingWithoutText, sx = [], ...props },
  ref,
) => (
  <MuiButton
    sx={[
      {
        pointerEvents: loading ? "none" : "auto",
        position: "relative",
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
    ref={ref}
  >
    {loading ? (
      <LoadingContent
        loadingText={loadingText}
        withText={!loadingWithoutText}
        size={props.size}
        variant={props.variant}
      />
    ) : (
      children
    )}
  </MuiButton>
);

const ButtonForwardRef = forwardRef(Button);

export { ButtonForwardRef as Button };
