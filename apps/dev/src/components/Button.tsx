/**
 * @todo update from HASH workspace
 */

import {
  Box,
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  useTheme,
} from "@mui/material";
// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import { FC, forwardRef, useMemo, VFC } from "react";
import { isHrefExternal } from "./Link";
import { LoadingSpinner } from "./LoadingSpinner";

export type ButtonProps = {
  loading?: boolean;
  loadingWithoutText?: boolean;
  disabledTooltipText?: string;
} & MuiButtonProps & { rel?: string; target?: string }; // MUI button renders <a /> when href is provided, but typings miss rel and target

const LoadingContent: VFC<{
  withText: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
}> = ({ withText, size, variant = "primary" }) => {
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
          Loading...
        </Box>
      )}
    </Box>
  );
};

/**
 * @todo check icon styles
 * @todo check loading styles
 */
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
