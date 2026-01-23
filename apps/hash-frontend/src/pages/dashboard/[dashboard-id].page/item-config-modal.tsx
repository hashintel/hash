import type { EntityId, WebId } from "@blockprotocol/type-system";
import { faCheckCircle, faCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Typography,
} from "@mui/material";

import { Modal } from "../../../shared/ui/modal";
import {
  type ConfigStep,
  useDashboardItemConfig,
} from "../hooks/use-dashboard-item-config";
import { ChartConfigStep } from "./item-config-modal/chart-config-step";
import { GoalInputStep } from "./item-config-modal/goal-input-step";

type ItemConfigModalProps = {
  open: boolean;
  onClose: () => void;
  itemEntityId: EntityId;
  webId: WebId;
  initialGoal?: string;
};

const PROGRESS_STEPS = [
  { key: "query", label: "Generating query..." },
  { key: "analysis", label: "Analyzing data..." },
  { key: "chart", label: "Creating chart..." },
] as const;

/**
 * Shows progress of the AI configuration workflow
 */
const ConfigurationProgress = ({
  currentStep,
  structuralQueryReady,
  pythonScriptReady,
  chartConfigReady,
}: {
  currentStep: ConfigStep;
  structuralQueryReady: boolean;
  pythonScriptReady: boolean;
  chartConfigReady: boolean;
}) => {
  const getStepStatus = (
    stepKey: string,
  ): "pending" | "in_progress" | "complete" => {
    if (stepKey === "query") {
      if (structuralQueryReady) {
        return "complete";
      }
      if (currentStep === "query") {
        return "in_progress";
      }
      return "pending";
    }
    if (stepKey === "analysis") {
      if (pythonScriptReady) {
        return "complete";
      }
      if (currentStep === "analysis" || structuralQueryReady) {
        return "in_progress";
      }
      return "pending";
    }
    if (stepKey === "chart") {
      if (chartConfigReady) {
        return "complete";
      }
      if (currentStep === "chart" || pythonScriptReady) {
        return "in_progress";
      }
      return "pending";
    }
    return "pending";
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        py: 6,
      }}
    >
      <CircularProgress size={48} />

      <Typography variant="h5" sx={{ fontWeight: 500 }}>
        Configuring your chart...
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
        {PROGRESS_STEPS.map((step) => {
          const status = getStepStatus(step.key);
          return (
            <Box
              key={step.key}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {status === "complete" ? (
                <FontAwesomeIcon
                  icon={faCheckCircle}
                  sx={({ palette }) => ({
                    color: palette.green[70],
                    fontSize: 20,
                  })}
                />
              ) : status === "in_progress" ? (
                <CircularProgress size={18} thickness={5} />
              ) : (
                <FontAwesomeIcon
                  icon={faCircle}
                  sx={({ palette }) => ({
                    color: palette.gray[30],
                    fontSize: 20,
                  })}
                />
              )}
              <Typography
                sx={({ palette }) => ({
                  color:
                    status === "complete"
                      ? palette.gray[80]
                      : status === "in_progress"
                        ? palette.gray[90]
                        : palette.gray[50],
                  fontWeight: status === "in_progress" ? 500 : 400,
                })}
              >
                {step.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export const ItemConfigModal = ({
  open,
  onClose,
  itemEntityId,
  webId,
  initialGoal = "",
}: ItemConfigModalProps) => {
  const {
    state,
    setUserGoal,
    generateQuery,
    setChartType,
    setChartConfig,
    saveConfiguration,
    reset,
  } = useDashboardItemConfig({
    itemEntityId,
    webId,
    onComplete: () => {
      onClose();
      reset();
    },
  });

  const handleClose = () => {
    onClose();
    // Reset state after a delay to avoid UI flash
    setTimeout(reset, 300);
  };

  const isConfiguring =
    state.step !== "goal" &&
    state.step !== "chart" &&
    state.step !== "complete";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      header={{ title: "Configure Chart" }}
      sx={{ minHeight: "50vh", maxWidth: 700, width: "100%" }}
      contentStyle={{ p: { xs: 0, md: 0 } }}
    >
      <Box>
        {state.isLoading && !isConfiguring && <LinearProgress />}

        <Box sx={{ p: 3 }}>
          {state.step === "goal" && (
            <GoalInputStep
              userGoal={state.userGoal || initialGoal}
              onGoalChange={setUserGoal}
              onSubmit={generateQuery}
              isLoading={state.isLoading}
              error={state.error}
            />
          )}

          {isConfiguring && (
            <ConfigurationProgress
              currentStep={state.step}
              structuralQueryReady={!!state.structuralQuery}
              pythonScriptReady={!!state.pythonScript}
              chartConfigReady={!!state.chartConfig}
            />
          )}

          {state.step === "chart" && (
            <ChartConfigStep
              chartData={state.chartData}
              chartType={state.chartType}
              chartConfig={state.chartConfig}
              onChartTypeChange={setChartType}
              onChartConfigChange={setChartConfig}
              onSave={saveConfiguration}
              isLoading={state.isLoading}
            />
          )}
        </Box>

        {state.error && isConfiguring && (
          <Box sx={{ px: 3, pb: 3 }}>
            <Typography color="error" variant="smallTextLabels">
              {state.error}
            </Typography>
          </Box>
        )}
      </Box>
    </Modal>
  );
};
