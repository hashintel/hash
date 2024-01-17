import {
  Box,
  Stack,
  SxProps,
  Theme,
  Typography,
  typographyClasses,
} from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, useMemo } from "react";

import { IconRainbowHash } from "./icon-rainbow-hash";

// @todo make this take the id
const OntologyChip: ForwardRefRenderFunction<
  HTMLDivElement,
  {
    domain: string;
    path: string;
    sx?: SxProps<Theme>;
  }
> = ({ domain, path, sx = [], ...props }, ref) => {
  const isHash = domain === "hash.ai";

  const icon = isHash ? <IconRainbowHash /> : null;

  const pathComponents = useMemo(() => {
    const match = path.match(
      /(@[\w-]+)(\/[^/]+\/[^/]*)?(?:\/([\w-]+))?(\/.*)?/,
    );

    return match
      ? {
          shortname: match[1],
          between: match[2] ? `${match[2]}${match[3] ? "/" : ""}` : undefined,
          slug: match[3],
          after: match[4],
        }
      : undefined;
  }, [path]);

  return (
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
        data-testid="ontology-chip-path"
        sx={(theme) => ({
          alignItems: "center",
          pr: 1.25,
          pl: "4px",
          color: theme.palette.gray[60],
          display: "flex",
          flexShrink: 1,
          minWidth: 0,
          [`& > span`]: {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            // Place the overflow ellipsis at the beginning, not the end
            "&:before": {
              // Ensure special characters aren't placed at the end
              // @see https://stackoverflow.com/questions/9793473/text-overflow-ellipsis-on-left-side#comment82783230_9793669
              content: '"\\00200e"',
            },
            direction: "rtl",
            textAlign: "left",
          },
        })}
      >
        {pathComponents ? (
          <Box component="span">
            <Typography
              component="span"
              fontWeight="bold"
              color={(theme) => theme.palette.blue[70]}
            >
              {pathComponents.shortname}
            </Typography>
            <Typography
              component="span"
              color={(theme) => theme.palette.blue[70]}
            >
              {pathComponents.between}
            </Typography>
            {pathComponents.slug ? (
              <Typography
                component="span"
                fontWeight="bold"
                color={(theme) => theme.palette.blue[70]}
              >
                {pathComponents.slug}
              </Typography>
            ) : null}
            {pathComponents.after ? (
              <Typography
                component="span"
                color={(theme) => theme.palette.blue[70]}
              >
                {pathComponents.after}
              </Typography>
            ) : null}
          </Box>
        ) : (
          <Typography
            component="span"
            fontWeight="bold"
            color={(theme) => theme.palette.blue[70]}
          >
            {path}
          </Typography>
        )}
      </Typography>
    </Stack>
  );
};

const OntologyChipForwardRef = forwardRef(OntologyChip);

export { OntologyChipForwardRef as OntologyChip };
