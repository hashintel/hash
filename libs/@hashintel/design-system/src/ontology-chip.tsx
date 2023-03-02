import { validateVersionedUrl } from "@blockprotocol/type-system/slim";
import {
  Box,
  Stack,
  SxProps,
  Theme,
  Typography,
  typographyClasses,
} from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, ReactNode } from "react";

import { OntologyIcon } from "./ontology-icon";

export const parseUrlForOntologyChip = (url: string) => {
  const validationResult = validateVersionedUrl(url);
  if (validationResult.type === "Err") {
    throw new Error(
      `Could not validate url as VersionedUrl: ${validationResult.inner.reason}`,
    );
  }
  const parsed = validationResult.inner;
  const parsedUrl = new URL(parsed);
  const domain =
    parsedUrl.host === "localhost:3000" ? "localhost" : parsedUrl.host;
  const path = parsedUrl.pathname.slice(1);
  const isHash = domain === "hash.ai";
  const icon = isHash ? <OntologyIcon /> : null;

  return { domain, path, icon };
};

// @todo make this take the id
const OntologyChip: ForwardRefRenderFunction<
  HTMLDivElement,
  {
    icon: ReactNode;
    domain: ReactNode;
    path: ReactNode;
    sx?: SxProps<Theme>;
  }
> = (
  {
    icon,
    domain,
    path,
    sx = [],
    ...props
  }: {
    icon: ReactNode;
    domain: ReactNode;
    path: ReactNode;
    sx?: SxProps<Theme>;
  },
  ref,
) => (
  <Stack
    {...props}
    direction="row"
    sx={[
      (theme) => ({
        height: 26,
        backgroundColor: theme.palette.gray[10],
        borderRadius: "13px",
        overflow: "hidden",
        width: "fit-content",
        alignItems: "stretch",
        [`.${typographyClasses.root}`]: {
          fontSize: 12,
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    ref={ref}
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
      {icon && (
        <Box
          width={16}
          height={16}
          mr={1.25}
          overflow="hidden"
          position="relative"
        >
          {icon}
        </Box>
      )}
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

          "&:last-of-type:not(:nth-of-type(1))": {
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

const OntologyChipForwardRef = forwardRef(OntologyChip);

export { OntologyChipForwardRef as OntologyChip };
