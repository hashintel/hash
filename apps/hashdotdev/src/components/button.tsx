import type { ButtonProps as MuiButtonProps } from "@mui/material";
import {
  Box,
  // eslint-disable-next-line no-restricted-imports
  Button as MuiButton,
  useTheme,
} from "@mui/material";
// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import type { FunctionComponent, ReactNode } from "react";
import { forwardRef, useMemo } from "react";

import { isHrefExternal } from "./link";
import { LoadingSpinner } from "./loading-spinner";

export type ButtonProps = {
  loading?: boolean;
  loadingText?: ReactNode;
  loadingWithoutText?: boolean;
  disabledTooltipText?: string;
} & MuiButtonProps & { rel?: string; target?: string }; // MUI button renders <a /> when href is provided, but typings miss rel and target

const LoadingContent: FunctionComponent<{
  loadingText?: ReactNode;
  withText: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
}> = ({ loadingText, withText, size, variant = "primary" }) => {
  const theme = useTheme();

  const spinnerSize = useMemo(() => {
    switch (size) {
      case "large":
        return 20;
      case "medium":
        return 16;
    }
  }, [size]);

  const spinnerColor = useMemo(() => {
    switch (variant) {
      case "tertiary":
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
          }}
        >
          {loadingText ?? "Loading..."}
        </Box>
      )}
    </Box>
  );
};

export const Button: FunctionComponent<ButtonProps & { openInNew?: boolean }> =
  forwardRef(
    (
      {
        children,
        loading,
        loadingText,
        loadingWithoutText,
        href,
        openInNew,
        ...props
      },
      ref,
    ) => {
      const linkProps = useMemo(() => {
        if (href && (openInNew ?? isHrefExternal(href))) {
          return {
            rel: "noopener",
            target: "_blank",
            href,
          };
        }

        return {};
      }, [href, openInNew]);

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

      if (href && !isHrefExternal(href)) {
        return (
          <Link href={href} passHref legacyBehavior>
            {Component}
          </Link>
        );
      }

      return Component;
    },
  );
