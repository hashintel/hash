// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import {
  Box,
  // eslint-disable-next-line no-restricted-imports
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  styled,
  Typography,
  Tooltip,
  tooltipClasses,
  TooltipProps,
} from "@mui/material";
import { VFC, FC, forwardRef, useMemo } from "react";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, LoadingSpinnerIcon } from "./icons";
import { isHrefExternal } from "./Link";

const DisabledTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    width: 260,
    backgroundColor: theme.palette.common.white,
    padding: "17px 16px",
    color: theme.palette.orange[80],
    boxShadow: theme.boxShadows.md,
    border: `1px solid ${theme.palette.gray[20]}`,
  },
}));

const LoadingContent: VFC<{
  withText: boolean;
  isXS: boolean;
}> = ({ withText, isXS }) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
      }}
    >
      <LoadingSpinnerIcon
        sx={{
          width: 16,
          height: 16,
          animation: "spin 1.1s linear infinite",
          "@keyframes spin": {
            "0%": {
              transform: "rotate(0)",
            },
            "100%": {
              transform: "rotate(360deg)",
            },
          },
        }}
      />

      {withText && (
        <Box
          component="span"
          sx={{
            ml: "12px",
            ...(isXS && { ml: "8px" }),
          }}
        >
          Loading...
        </Box>
      )}
    </Box>
  );
};

// @todo-mui
// - work on icon buttons

export type ButtonProps = {
  loading?: boolean;
  loadingWithoutText?: boolean;
  disabledTooltipText?: string;
} & MuiButtonProps & { rel?: string; target?: string }; // MUI button renders <a /> when href is provided, but typings miss rel and target

export const Button: FC<ButtonProps> = forwardRef(
  ({ children, loading, loadingWithoutText, href, sx, ...props }, ref) => {
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
      <MuiButton {...props} {...linkProps} sx={sx} ref={ref}>
        {loading || loadingWithoutText ? (
          <LoadingContent
            withText={!loadingWithoutText}
            isXS={props.size === "xs"}
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
