// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import {
  Box,
  // eslint-disable-next-line no-restricted-imports
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  CircularProgress,
  circularProgressClasses,
  Theme,
} from "@mui/material";
import { VFC, FC, forwardRef, useMemo } from "react";
import { isHrefExternal } from "./Link";

const LOADING_SPINNER_THICKNESS = 4;

export type ButtonProps = {
  loading?: boolean;
  loadingWithoutText?: boolean;
  disabledTooltipText?: string;
} & MuiButtonProps & { rel?: string; target?: string }; // MUI button renders <a /> when href is provided, but typings miss rel and target

const mapVariantToLoadingIndicatorColour =
  (variant: ButtonProps["variant"]) =>
  ({ palette }: Theme) => {
    switch (variant) {
      case "tertiary":
      case "tertiary_quiet":
        return palette.gray[50];
      default:
        return "currentColor";
    }
  };

const mapSizeToSpinnerSize = (size: ButtonProps["size"]) => {
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
};

const LoadingContent: VFC<{
  withText: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
}> = ({ withText, size, variant = "primary" }) => {
  const spinnerSize = mapSizeToSpinnerSize(size);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
      }}
    >
      <Box position="relative" height={spinnerSize} width={spinnerSize}>
        <CircularProgress
          variant="determinate"
          sx={{
            opacity: 0.2,
            color: mapVariantToLoadingIndicatorColour(variant),
            position: "absolute",
            left: 0,
          }}
          size={spinnerSize}
          thickness={LOADING_SPINNER_THICKNESS}
          value={100}
        />
        <CircularProgress
          variant="indeterminate"
          disableShrink
          sx={{
            color: mapVariantToLoadingIndicatorColour(variant),
            animationDuration: "750ms",
            position: "absolute",
            left: 0,
            [`& .${circularProgressClasses.circle}`]: {
              strokeLinecap: "round",
            },
          }}
          size={spinnerSize}
          thickness={LOADING_SPINNER_THICKNESS}
        />
      </Box>
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

export const Button: FC<ButtonProps> = forwardRef(
  ({ children, loading, loadingWithoutText, href, ...props }, ref) => {
    const linkProps = useMemo(() => {
      if (href && isHrefExternal(href)) {
        return {
          rel: "noopener",
          target: "_blank",
          href,
        };
      }

      return {};
    }, [href]);

    const Component = (
      <MuiButton
        sx={{
          ...(loading && { pointerEvents: "none" }),
          ...props.sx,
        }}
        {...props}
        {...linkProps}
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

    if (href && !isHrefExternal(href)) {
      return (
        <Link href={href} passHref>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);
