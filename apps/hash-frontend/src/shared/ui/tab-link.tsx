import { LoadingSpinner } from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import { Box, SxProps, Tab, Theme, Typography } from "@mui/material";
import millify from "millify";
import { FunctionComponent, ReactElement, ReactNode } from "react";

import { Link } from "./link";

export type TabLinkProps = {
  label: ReactNode;
  href: string;
  value: string;
  count?: number;
  icon?: ReactElement;
  loading?: boolean;
  active?: boolean;
  sx?: SxProps<Theme>;
};

export const TabLink: FunctionComponent<TabLinkProps> = ({
  label,
  href,
  value,
  count,
  loading,
  active,
  icon,
  ...props
}) => (
  <Tab
    {...props}
    disableRipple
    value={value}
    href={href}
    component={Link}
    label={
      <Typography
        variant="smallTextLabels"
        fontWeight={500}
        sx={{
          paddingY: 0.25,
        }}
      >
        {label}
      </Typography>
    }
    icon={
      typeof count === "number" || loading ? (
        <Box
          sx={({ palette }) => ({
            display: "flex",
            paddingX: loading ? 0.5 : 1,
            paddingY: loading ? 0.5 : 0.25,
            borderRadius: 30,
            background: active ? palette.blue[20] : palette.gray[20],
          })}
        >
          {loading ? (
            <LoadingSpinner
              color={
                active ? theme.palette.primary.main : theme.palette.gray[60]
              }
              size={14}
              thickness={6}
            />
          ) : (
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                fontWeight: 500,
                color: active ? palette.primary.main : palette.gray[80],
              })}
            >
              {millify(count ?? 0)}
            </Typography>
          )}
        </Box>
      ) : (
        icon ?? undefined
      )
    }
    iconPosition="end"
  />
);
