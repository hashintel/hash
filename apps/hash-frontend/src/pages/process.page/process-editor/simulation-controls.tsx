import {
  ArrowsRotateRegularIcon,
  ForwardStepSolidIcon,
  PlaySolidIcon,
  Select,
} from "@hashintel/design-system";
import {
  Box,
  FormControl,
  Stack,
  type SvgIconProps,
  Tooltip,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";

import { StopSolidIcon } from "../../../shared/icons/stop-icon-solid";
import { Button } from "../../../shared/ui/button";
import { MenuItem } from "../../../shared/ui/menu-item";

const SimulationControlButton = ({
  background,
  disabled,
  Icon,
  onClick,
  tooltip,
}: {
  background: "blue" | "red";
  disabled: boolean;
  Icon: FunctionComponent<SvgIconProps>;
  onClick: () => void;
  tooltip: string;
}) => {
  return (
    <Tooltip title={tooltip} placement="top">
      <span>
        <Button
          disabled={disabled}
          onClick={onClick}
          size="xs"
          sx={({ palette, transitions }) => ({
            background:
              background === "red" ? palette.red[70] : palette.blue[70],
            "&:disabled": {
              background: palette.gray[50],
            },
            "&:before": { background: "transparent" },
            "&:hover": {
              background:
                background === "red" ? palette.red[70] : palette.blue[70],
              opacity: 0.8,
            },
            "&:hover svg": {
              color: palette.common.white,
              fill: palette.common.white,
            },
            transition: transitions.create(["background", "opacity"]),
          })}
        >
          <Icon
            sx={{
              fill: ({ palette }) =>
                background === "red" ? palette.common.white : palette.blue[30],
              fontSize: 14,
              transition: ({ transitions }) => transitions.create("fill"),
            }}
          />
        </Button>
      </span>
    </Tooltip>
  );
};

export type SimulationControlsProps = {
  isSimulating: boolean;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
  onSimulationStep: () => void;
  onReset: () => void;
  timeStep: number;
  setTimeStep: (timeStep: number) => void;
  simulationSpeed: number;
  setSimulationSpeed: (simulationSpeed: number) => void;
  globalClock: number;
};

export const SimulationControls = ({
  isSimulating,
  onStartSimulation,
  onStopSimulation,
  onSimulationStep,
  onReset,
  timeStep,
  setTimeStep,
  simulationSpeed,
  setSimulationSpeed,
  globalClock,
}: SimulationControlsProps) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        p: 2,
        borderRadius: 1,
        bgcolor: "background.paper",
        boxShadow: 1,
      }}
    >
      {/* Control buttons */}
      <Stack direction="row" justifyContent="space-between">
        <Stack direction="row" spacing={1}>
          {isSimulating ? (
            <SimulationControlButton
              background="red"
              disabled={false}
              Icon={StopSolidIcon}
              onClick={onStopSimulation}
              tooltip="Stop simulation"
            />
          ) : (
            <SimulationControlButton
              background="blue"
              disabled={false}
              Icon={PlaySolidIcon}
              onClick={onStartSimulation}
              tooltip="Start simulation"
            />
          )}
          <SimulationControlButton
            background="blue"
            disabled={isSimulating}
            Icon={ForwardStepSolidIcon}
            onClick={onSimulationStep}
            tooltip="Step forward"
          />
          <SimulationControlButton
            background="red"
            disabled={false}
            Icon={ArrowsRotateRegularIcon}
            onClick={onReset}
            tooltip="Reset simulation"
          />
        </Stack>

        {/* Simulation time display */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.paper",
          }}
        >
          <Typography fontWeight="bold" variant="smallTextLabels">
            Elapsed:
          </Typography>
          <Typography variant="smallTextLabels">
            {globalClock.toFixed(1)} hours
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" gap={2}>
        {/* Speed control */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ minWidth: 50 }} variant="smallTextLabels">
            Speed:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={String(simulationSpeed)}
              onChange={(event) =>
                setSimulationSpeed(Number(event.target.value))
              }
              variant="outlined"
              size="xs"
            >
              <MenuItem value="2000">Slow</MenuItem>
              <MenuItem value="1000">Normal</MenuItem>
              <MenuItem value="500">Fast</MenuItem>
              <MenuItem value="200">Very Fast</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Time step control */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ minWidth: 50 }} variant="smallTextLabels">
            Step:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={String(timeStep)}
              onChange={(event) => setTimeStep(Number(event.target.value))}
              variant="outlined"
              size="xs"
            >
              <MenuItem value="0.25">15 minutes</MenuItem>
              <MenuItem value="0.5">30 minutes</MenuItem>
              <MenuItem value="1">1 hour</MenuItem>
              <MenuItem value="2">2 hours</MenuItem>
              <MenuItem value="4">4 hours</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>
    </Box>
  );
};
