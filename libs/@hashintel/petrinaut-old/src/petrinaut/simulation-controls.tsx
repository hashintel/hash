import {
  ArrowsRotateRegularIcon,
  ForwardStepSolidIcon,
  PlaySolidIcon,
  Select,
  StopSolidIcon,
} from "@hashintel/design-system";
import {
  Box,
  Button,
  FormControl,
  MenuItem,
  Stack,
  type SvgIconProps,
  Tooltip,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";

import { useSimulationContext } from "./simulation-context";

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

export const SimulationControls = () => {
  const {
    isSimulating,
    setIsSimulating,
    fireNextStep,
    resetSimulation,
    simulationSpeed,
    setSimulationSpeed,
    currentStep,
  } = useSimulationContext();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 1.5,
        borderRadius: 1,
        bgcolor: "background.paper",
        boxShadow: 1,
      }}
    >
      {/* Simulation control buttons */}
      <Stack direction="row" justifyContent="space-between">
        {isSimulating ? (
          <SimulationControlButton
            background="red"
            disabled={false}
            Icon={StopSolidIcon}
            onClick={() => setIsSimulating(false)}
            tooltip="Stop simulation"
          />
        ) : (
          <SimulationControlButton
            background="blue"
            disabled={false}
            Icon={PlaySolidIcon}
            onClick={() => setIsSimulating(true)}
            tooltip="Start simulation"
          />
        )}
        <SimulationControlButton
          background="blue"
          disabled={isSimulating}
          Icon={ForwardStepSolidIcon}
          onClick={fireNextStep}
          tooltip="Step forward"
        />
        <SimulationControlButton
          background="red"
          disabled={false}
          Icon={ArrowsRotateRegularIcon}
          onClick={resetSimulation}
          tooltip="Reset simulation"
        />
      </Stack>

      <Stack direction="row" justifyContent="space-between" gap={1}>
        {/* Simulation step display */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 0.5,
            py: 1,
            px: 1,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.paper",
            width: 75,
          }}
        >
          <Typography fontWeight="bold" variant="smallTextLabels">
            Step:
          </Typography>
          <Typography variant="smallTextLabels">{currentStep}</Typography>
        </Box>

        {/* Speed control (the interval between steps) */}
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 90 }}>
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
            </Select>
          </FormControl>
        </Stack>
      </Stack>
    </Box>
  );
};
