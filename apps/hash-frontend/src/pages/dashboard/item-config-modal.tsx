import type { EntityId } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import { Close as CloseIcon } from "@mui/icons-material";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Step,
  StepLabel,
  Stepper,
} from "@mui/material";

import { AnalysisPreviewStep } from "./config-steps/analysis-preview-step";
import { ChartConfigStep } from "./config-steps/chart-config-step";
import { GoalInputStep } from "./config-steps/goal-input-step";
import { QueryPreviewStep } from "./config-steps/query-preview-step";
import {
  type ConfigStep,
  useDashboardItemConfig,
} from "./hooks/use-dashboard-item-config";

type ItemConfigModalProps = {
  open: boolean;
  onClose: () => void;
  itemEntityId: EntityId;
  initialGoal?: string;
};

const STEPS: { key: ConfigStep; label: string }[] = [
  { key: "goal", label: "Define Goal" },
  { key: "query", label: "Review Query" },
  { key: "analysis", label: "Review Analysis" },
  { key: "chart", label: "Configure Chart" },
];

const getStepIndex = (step: ConfigStep): number => {
  const index = STEPS.findIndex((stepItem) => stepItem.key === step);
  return index >= 0 ? index : 0;
};

export const ItemConfigModal = ({
  open,
  onClose,
  itemEntityId,
  initialGoal = "",
}: ItemConfigModalProps) => {
  const {
    state,
    setUserGoal,
    generateQuery,
    regenerateQuery,
    confirmQuery,
    regenerateAnalysis,
    confirmAnalysis,
    setChartType,
    setChartConfig,
    saveConfiguration,
    reset,
  } = useDashboardItemConfig({
    itemEntityId,
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

  const activeStep = getStepIndex(state.step);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: "70vh" },
      }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        Configure Chart
        <IconButton
          onClick={handleClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {state.isLoading && <LinearProgress />}

      <Box sx={{ px: 3, pt: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map((step) => (
            <Step key={step.key}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent>
        {state.step === "goal" && (
          <GoalInputStep
            userGoal={state.userGoal || initialGoal}
            onGoalChange={setUserGoal}
            onSubmit={generateQuery}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}

        {state.step === "query" && (
          <QueryPreviewStep
            structuredQuery={state.structuredQuery}
            explanation={state.queryExplanation}
            sampleData={state.sampleData}
            onRegenerate={regenerateQuery}
            onConfirm={confirmQuery}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}

        {state.step === "analysis" && (
          <AnalysisPreviewStep
            pythonScript={state.pythonScript}
            chartData={state.chartData}
            chartType={state.chartType}
            onRegenerate={regenerateAnalysis}
            onConfirm={confirmAnalysis}
            isLoading={state.isLoading}
            error={state.error}
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
      </DialogContent>
    </Dialog>
  );
};
