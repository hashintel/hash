import {
  Box,
  SxProps,
  Tab,
  Theme,
  Typography,
  typographyClasses,
} from "@mui/material";
import { FunctionComponent, ReactElement } from "react";

import { Link } from "../../../../../../shared/ui/link";

export type TabLinkProps = {
  label: string;
  href: string;
  value: string;
  count?: number;
  icon?: ReactElement;
  active?: boolean;
  sx?: SxProps<Theme>;
};

export const TabLink: FunctionComponent<TabLinkProps> = ({
  label,
  href,
  value,
  count,
  active,
  icon,
  sx,
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
      typeof count === "number" ? (
        <Box
          sx={({ palette }) => ({
            display: "flex",
            paddingX: 1,
            paddingY: 0.25,
            borderRadius: 30,
            background: active ? palette.blue[20] : palette.gray[20],
          })}
        >
          <Typography
            variant="microText"
            sx={({ palette }) => ({
              fontWeight: 500,
              color: active ? palette.primary.main : palette.gray[80],
            })}
          >
            {count}
          </Typography>
        </Box>
      ) : (
        icon ?? undefined
      )
    }
    iconPosition="end"
    sx={[
      ({ palette }) => ({
        marginRight: 3,
        paddingY: 1.25,
        paddingX: 0.5,
        minWidth: 0,
        minHeight: 0,
        ":hover": {
          [`.${typographyClasses.root}`]: {
            color: `${
              active ? palette.primary.main : palette.blue[60]
            } !important`,
          },
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  />
);
