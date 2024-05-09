import {
  AngleRightRegularIcon,
  InfinityLightIcon,
  PlayIconSolid,
  Select,
} from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { useMemo } from "react";

import { Button } from "../../../../shared/ui/button";
import { MenuItem } from "../../../../shared/ui/menu-item";
import { useFlowDefinitionsContext } from "../../../shared/flow-definitions-context";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { Link } from "../../../../shared/ui/link";

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
}: {
  handleRunFlowClicked: () => void;
}) => {
  const { flowDefinitions, selectedFlow, setSelectedFlow } =
    useFlowDefinitionsContext();

  const { flowRuns, selectedFlowRun, setSelectedFlowRunId } =
    useFlowRunsContext();

  const runOptions = useMemo(
    () =>
      flowRuns.filter(
        (run) => run.inputs[0].flowDefinition.name === selectedFlow.name,
      ),
    [flowRuns, selectedFlow.name],
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
        <InfinityLightIcon
          sx={{ fill: ({ palette }) => palette.gray[60], fontSize: 20, mr: 1 }}
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
            value={selectedFlow.name}
            onChange={(event) => {
              setSelectedFlow(
                flowDefinitions.find((def) => def.name === event.target.value)!,
              );
              setSelectedFlowRunId(null);
            }}
          >
            {flowDefinitions.map((flow) => (
              <MenuItem key={flow.name} value={flow.name}>
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
              value={selectedFlowRun?.workflowId ?? "none"}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  setSelectedFlowRunId(null);
                }
                setSelectedFlowRunId(event.target.value);
              }}
            >
              <MenuItem selected value="none">
                Definition
              </MenuItem>
              {runOptions.map((run) => (
                <MenuItem
                  key={run.workflowId}
                  value={run.workflowId}
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
    </Stack>
  );
};
