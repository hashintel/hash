import {
  Box,
  Stack,
  SxProps,
  Theme,
  Typography,
  typographyClasses,
} from "@mui/material";
import { ReactNode } from "react";

export const OntologyChip = ({
  icon,
  domain,
  path,
  sx = [],
}: {
  icon: ReactNode;
  domain: ReactNode;
  path: ReactNode;
  sx?: SxProps<Theme>;
}) => (
  <Stack
    direction="row"
    sx={[
      (theme) => ({
        height: 26,
        backgroundColor: theme.palette.gray[10],
        borderRadius: "9999px",
        overflow: "hidden",
        width: "fit-content",
        alignItems: "stretch",
        [`.${typographyClasses.root}`]: {
          fontSize: 12,
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    <Stack
      direction="row"
      alignItems="center"
      bgcolor="gray.20"
      pl="13px"
      pr="15px"
      sx={{
        clipPath: "polygon(0 0, 100% 0, calc(100% - 7px) 100%, 0 100%)",
      }}
    >
      <Box
        width={16}
        height={16}
        mr={1.25}
        overflow="hidden"
        position="relative"
      >
        {icon}
      </Box>
      <Typography
        sx={(theme) => ({
          color: theme.palette.gray[80],
          fontWeight: 500,
        })}
      >
        {domain}
      </Typography>
    </Stack>
    <Typography
      component={Stack}
      direction="row"
      sx={(theme) => ({
        alignItems: "center",
        pr: 1.25,
        pl: "4px",
        color: theme.palette.gray[60],
        display: "flex",
        flexShrink: 1,
        minWidth: 0,

        [`.${typographyClasses.root}`]: {
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",

          "&:last-child:not(:nth-child(1))": {
            // Place the overflow ellipsis at the beginning, not the end
            "&:before": {
              // Ensure special characters aren't placed at the end
              // @see https://stackoverflow.com/questions/9793473/text-overflow-ellipsis-on-left-side#comment82783230_9793669
              content: '"\\00200e"',
            },
            direction: "rtl",
            textAlign: "left",
          },
        },
      })}
    >
      {path}
    </Typography>
  </Stack>
);
