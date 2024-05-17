import {
  AngleRightRegularIcon,
  InfinityLightIcon,
  PlayIconSolid,
  Select,
} from "@hashintel/design-system";
import {
  generateFlowDefinitionPath,
  generateWorkerRunPath,
} from "@local/hash-isomorphic-utils/flows/frontend-paths";
import type { SxProps, Theme } from "@mui/material";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { Button } from "../../../../shared/ui/button";
import { Link } from "../../../../shared/ui/link";
import { MenuItem } from "../../../../shared/ui/menu-item";
import { useFlowDefinitionsContext } from "../../../shared/flow-definitions-context";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { BoltLightIcon } from "../../../../shared/icons/bolt-light-icon";

const typographySx: SxProps<Theme> = {
  color: ({ palette }) => palette.gray[70],
  fontWeight: 500,
  lineHeight: 1,
};

const selectSx: SxProps<Theme> = {
  background: "transparent",
  boxShadow: "none",
  [`& .${outlinedInputClasses.input}`]: {
    fontSize: 14,
    padding: "6px 12px",
    ...typographySx,
  },
  "& svg": {
    fontSize: 14,
  },
};

const Divider = () => (
  <AngleRightRegularIcon
    sx={{
      fill: ({ palette }) => palette.gray[50],
      fontSize: 18,
      mr: 0.5,
      ml: 1,
    }}
  />
);

export const topbarHeight = 50;

export const Topbar = ({
  handleRunFlowClicked,
  showRunButton,
}: {
  handleRunFlowClicked: () => void;
  showRunButton: boolean;
}) => {
  const { push } = useRouter();

  const { flowDefinitions, selectedFlowDefinitionId } =
    useFlowDefinitionsContext();

  const { flowRuns, selectedFlowRunId } = useFlowRunsContext();

  const runOptions = useMemo(
    () =>
      flowRuns.filter(
        (run) => run.flowDefinitionId === selectedFlowDefinitionId,
      ),
    [flowRuns, selectedFlowDefinitionId],
  );

  return (
    <Stack
      alignItems="center"
      direction="row"
      justifyContent="space-between"
      sx={({ palette }) => ({
        background: palette.gray[5],
        borderBottom: `1px solid ${palette.gray[20]}`,
        height: topbarHeight,
        px: 2,
        width: "100%",
      })}
    >
      <Stack direction="row" alignItems="center">
        <BoltLightIcon
          sx={{
            fill: ({ palette }) => palette.gray[60],
            fontSize: 14,
            mr: 0.8,
          }}
        />
        <Link href="/workers" noLinkStyle>
          <Typography sx={typographySx} variant="smallTextParagraphs">
            Workers
          </Typography>
        </Link>
        <Divider />

        <InfinityLightIcon
          sx={{
            fill: ({ palette }) => palette.gray[60],
            fontSize: 20,
            mr: 1,
          }}
        />
        <Link href="/flows" noLinkStyle>
          <Typography sx={typographySx} variant="smallTextParagraphs">
            Flows
          </Typography>
        </Link>
        <Divider />
        <Box mr={1}>
          <Select
            selectSx={selectSx}
            value={selectedFlowDefinitionId ?? "none"}
            onChange={(event) => {
              /**
               * @todo update this to use the flow definition's uuid when stored in the db
               *    also then needs to take account of the correct namespace, which might be different from the current
               */
              void push(
                generateFlowDefinitionPath({
                  shortname: "hash",
                  flowDefinitionId: event.target.value,
                }),
              );
            }}
          >
            {flowDefinitions.map((flow) => (
              <MenuItem
                key={flow.flowDefinitionId}
                value={flow.flowDefinitionId}
              >
                {flow.name}
              </MenuItem>
            ))}
          </Select>
        </Box>
        {runOptions.length > 0 && (
          <>
            <Divider />
            <Select
              selectSx={{ ...selectSx, minWidth: 100 }}
              value={selectedFlowRunId ?? "none"}
              onChange={(event) => {
                const value = event.target.value;

                if (value === "none") {
                  void push(
                    generateFlowDefinitionPath({
                      shortname: "hash",
                      flowDefinitionId: selectedFlowDefinitionId ?? "none",
                    }),
                  );
                  return;
                }

                void push(
                  /** @todo get the correct shortname */
                  generateWorkerRunPath({
                    shortname: "hash",
                    flowRunId: value,
                  }),
                );
              }}
            >
              <MenuItem selected value="none">
                Definition
              </MenuItem>
              {runOptions.map((run) => (
                <MenuItem
                  key={run.flowRunId}
                  value={run.flowRunId}
                  sx={{ fontFamily: "monospace" }}
                >
                  Run
                  {run.closedAt
                    ? ` – ${format(new Date(run.closedAt), "yyyy-MM-dd h:mm a")}`
                    : " – in progress"}
                </MenuItem>
              ))}
            </Select>
          </>
        )}
      </Stack>
      {showRunButton && (
        <Button
          onClick={handleRunFlowClicked}
          size="xs"
          sx={{
            px: "14px",
            "&:before": { background: "transparent" },
            "&:hover svg": {
              fill: ({ palette }) => palette.common.white,
            },
          }}
        >
          <PlayIconSolid
            sx={{
              fill: ({ palette }) => palette.blue[40],
              fontSize: 14,
              mr: 1,
              transition: ({ transitions }) => transitions.create("fill"),
            }}
          />
          <Typography
            sx={{
              color: ({ palette }) => palette.common.white,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Run
          </Typography>
        </Button>
      )}
    </Stack>
  );
};
