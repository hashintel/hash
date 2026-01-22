# Agent 5: Frontend LLM Configuration UI

> **📋 Overview**: See [dashboard-overview.md](dashboard-overview.md) for the full feature context, architecture diagrams, and how this work stream relates to others.

## Mission

Build the modal/wizard interface for configuring dashboard items via LLM, including goal input, query preview, analysis preview, and chart configuration steps.

## Prerequisites

- Understanding of React, MUI
- Agent 4's dashboard UI components must exist (or use mocks)
- Agent 3's GraphQL mutations must exist (or use mocks)

## Reference Files

- Modal patterns: `apps/hash-frontend/src/pages/@/[shortname]/shared/flow-visualizer/run-flow-modal/`
- Slide stack: `apps/hash-frontend/src/pages/shared/slide-stack.tsx`
- Form patterns: `apps/hash-frontend/src/components/forms/`

## Files to Create

```
apps/hash-frontend/src/pages/dashboard/
├── item-config-modal.tsx                  # Main modal container
├── config-steps/
│   ├── goal-input-step.tsx               # Step 1: Enter goal
│   ├── query-preview-step.tsx            # Step 2: Review query
│   ├── analysis-preview-step.tsx         # Step 3: Review analysis
│   └── chart-config-step.tsx             # Step 4: Configure chart
└── hooks/
    ├── use-dashboard-item-config.ts      # Hook for config workflow
    └── use-poll-workflow-status.ts       # Hook for polling status
```

---

## Detailed Implementation

### Step 1: Configuration Workflow Hook

Create `apps/hash-frontend/src/pages/dashboard/hooks/use-dashboard-item-config.ts`:

```typescript
import { useCallback, useState } from "react";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import type { Filter } from "@local/hash-graph-client";

export type ConfigStep = "goal" | "query" | "analysis" | "chart" | "complete";

export type ConfigState = {
  step: ConfigStep;
  userGoal: string;
  structuredQuery: Filter | null;
  queryExplanation: string | null;
  sampleData: unknown[] | null;
  pythonScript: string | null;
  chartData: unknown[] | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
  isLoading: boolean;
  error: string | null;
  workflowId: string | null;
};

const initialState: ConfigState = {
  step: "goal",
  userGoal: "",
  structuredQuery: null,
  queryExplanation: null,
  sampleData: null,
  pythonScript: null,
  chartData: null,
  chartType: null,
  chartConfig: null,
  isLoading: false,
  error: null,
  workflowId: null,
};

type UseDashboardItemConfigParams = {
  itemEntityId: EntityId;
  webId: WebId;
  onComplete?: () => void;
};

export const useDashboardItemConfig = ({
  itemEntityId,
  webId,
  onComplete,
}: UseDashboardItemConfigParams) => {
  const [state, setState] = useState<ConfigState>(initialState);

  const setStep = useCallback((step: ConfigStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setUserGoal = useCallback((userGoal: string) => {
    setState((prev) => ({ ...prev, userGoal }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, isLoading: false }));
  }, []);

  const generateQuery = useCallback(async () => {
    if (!state.userGoal) {
      setError("Please enter a goal for this chart");
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to trigger query generation
      // For now, simulate with mock data
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockQuery: Filter = {
        all: [
          {
            equal: [
              { path: ["type", "title"] },
              { parameter: "Flight" },
            ],
          },
        ],
      };

      const mockSampleData = [
        { name: "Flight AA123", scheduledTime: 1200, status: "On Time" },
        { name: "Flight UA456", scheduledTime: 1150, status: "Delayed" },
        { name: "Flight DL789", scheduledTime: 1100, status: "On Time" },
      ];

      setState((prev) => ({
        ...prev,
        structuredQuery: mockQuery,
        queryExplanation: "This query retrieves all Flight entities ordered by scheduled time.",
        sampleData: mockSampleData,
        isLoading: false,
        step: "query",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate query");
    }
  }, [state.userGoal, setError]);

  const regenerateQuery = useCallback(async () => {
    await generateQuery();
  }, [generateQuery]);

  const confirmQuery = useCallback(() => {
    setStep("analysis");
    // Trigger analysis generation
    analyzeData();
  }, []);

  const analyzeData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to trigger data analysis
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockChartData = [
        { name: "Flight AA123", value: 1200 },
        { name: "Flight UA456", value: 1150 },
        { name: "Flight DL789", value: 1100 },
        { name: "Flight SW012", value: 1050 },
        { name: "Flight BA345", value: 1000 },
      ];

      const mockPythonScript = `
import json

# Load entity data
with open('/data/entities.json', 'r') as f:
    data = json.load(f)

# Extract flights and sort by scheduled time
flights = [e for e in data['entities'] if e['entityType'] == 'Flight']
flights.sort(key=lambda x: x['properties'].get('scheduledTime', 0), reverse=True)

# Format for chart
chart_data = [
    {'name': f['properties']['name'], 'value': f['properties']['scheduledTime']}
    for f in flights[:10]
]

print(json.dumps(chart_data))
`;

      setState((prev) => ({
        ...prev,
        pythonScript: mockPythonScript,
        chartData: mockChartData,
        chartType: "bar",
        isLoading: false,
        step: "analysis",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze data");
    }
  }, [setError]);

  const regenerateAnalysis = useCallback(async () => {
    await analyzeData();
  }, [analyzeData]);

  const confirmAnalysis = useCallback(() => {
    setStep("chart");
    // Trigger chart config generation
    generateChartConfig();
  }, []);

  const generateChartConfig = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to generate chart config
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockConfig: ChartConfig = {
        xAxisKey: "name",
        yAxisKey: "value",
        xAxisLabel: "Flight",
        yAxisLabel: "Scheduled Time",
        colors: ["#8884d8"],
        showLegend: false,
        showGrid: true,
        showTooltip: true,
      };

      setState((prev) => ({
        ...prev,
        chartConfig: mockConfig,
        isLoading: false,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate chart config");
    }
  }, [setError]);

  const setChartType = useCallback((chartType: ChartType) => {
    setState((prev) => ({ ...prev, chartType }));
  }, []);

  const setChartConfig = useCallback((chartConfig: ChartConfig) => {
    setState((prev) => ({ ...prev, chartConfig }));
  }, []);

  const saveConfiguration = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to save the configuration
      await new Promise((resolve) => setTimeout(resolve, 500));

      setState((prev) => ({ ...prev, step: "complete", isLoading: false }));
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    }
  }, [onComplete, setError]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
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
  };
};
```

### Step 2: Goal Input Step

Create `apps/hash-frontend/src/pages/dashboard/config-steps/goal-input-step.tsx`:

```tsx
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Chip,
  Stack,
} from "@mui/material";
import { AutoAwesome as AiIcon } from "@mui/icons-material";

type GoalInputStepProps = {
  userGoal: string;
  onGoalChange: (goal: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
};

const EXAMPLE_GOALS = [
  "Show top 10 flights by scheduled departure time",
  "Compare revenue across product categories",
  "Display monthly user signups over the last year",
  "Show distribution of order statuses",
  "Track task completion rates by team",
];

export const GoalInputStep = ({
  userGoal,
  onGoalChange,
  onSubmit,
  isLoading,
  error,
}: GoalInputStepProps) => {
  const handleExampleClick = (example: string) => {
    onGoalChange(example);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        What would you like to visualize?
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Describe your visualization goal in natural language. Our AI will help
        generate the appropriate query and chart configuration.
      </Typography>

      <TextField
        fullWidth
        multiline
        rows={3}
        value={userGoal}
        onChange={(e) => onGoalChange(e.target.value)}
        placeholder="e.g., Show the top 10 flights by scheduled departure time"
        variant="outlined"
        error={!!error}
        helperText={error}
        disabled={isLoading}
        sx={{ mb: 3 }}
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          Example goals:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {EXAMPLE_GOALS.map((example) => (
            <Chip
              key={example}
              label={example}
              onClick={() => handleExampleClick(example)}
              variant="outlined"
              size="small"
              sx={{ mb: 1 }}
            />
          ))}
        </Stack>
      </Paper>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={!userGoal.trim() || isLoading}
          startIcon={<AiIcon />}
        >
          {isLoading ? "Generating Query..." : "Generate Query"}
        </Button>
      </Box>
    </Box>
  );
};
```

### Step 3: Query Preview Step

Create `apps/hash-frontend/src/pages/dashboard/config-steps/query-preview-step.tsx`:

```tsx
import {
  Box,
  Button,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import type { Filter } from "@local/hash-graph-client";

type QueryPreviewStepProps = {
  structuredQuery: Filter | null;
  explanation: string | null;
  sampleData: unknown[] | null;
  onRegenerate: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string | null;
};

export const QueryPreviewStep = ({
  structuredQuery,
  explanation,
  sampleData,
  onRegenerate,
  onConfirm,
  isLoading,
  error,
}: QueryPreviewStepProps) => {
  const dataColumns = sampleData?.[0]
    ? Object.keys(sampleData[0] as object)
    : [];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Review Generated Query
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {explanation && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: "grey.50" }}>
          <Typography variant="subtitle2" gutterBottom>
            Explanation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {explanation}
          </Typography>
        </Paper>
      )}

      <Accordion defaultExpanded={false} sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Query Details (JSON)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: "grey.900",
              color: "grey.100",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              overflow: "auto",
              maxHeight: 300,
            }}
          >
            <pre style={{ margin: 0 }}>
              {JSON.stringify(structuredQuery, null, 2)}
            </pre>
          </Paper>
        </AccordionDetails>
      </Accordion>

      {sampleData && sampleData.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Sample Data ({sampleData.length} rows)
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  {dataColumns.map((col) => (
                    <TableCell key={col}>{col}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sampleData.slice(0, 5).map((row, index) => (
                  <TableRow key={index}>
                    {dataColumns.map((col) => (
                      <TableCell key={col}>
                        {String((row as Record<string, unknown>)[col] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {sampleData.length > 5 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Showing 5 of {sampleData.length} rows
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Button
          variant="outlined"
          onClick={onRegenerate}
          disabled={isLoading}
          startIcon={<RefreshIcon />}
        >
          Regenerate
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={isLoading || !structuredQuery}
          startIcon={<CheckIcon />}
        >
          {isLoading ? "Processing..." : "Looks Good, Continue"}
        </Button>
      </Box>
    </Box>
  );
};
```

### Step 4: Analysis Preview Step

Create `apps/hash-frontend/src/pages/dashboard/config-steps/analysis-preview-step.tsx`:

```tsx
import {
  Box,
  Button,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import type { ChartType } from "@local/hash-isomorphic-utils/dashboard-types";

import { ChartRenderer } from "../chart-renderer";

type AnalysisPreviewStepProps = {
  pythonScript: string | null;
  chartData: unknown[] | null;
  chartType: ChartType | null;
  onRegenerate: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string | null;
};

export const AnalysisPreviewStep = ({
  pythonScript,
  chartData,
  chartType,
  onRegenerate,
  onConfirm,
  isLoading,
  error,
}: AnalysisPreviewStepProps) => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Review Data Analysis
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        The AI has generated a Python script to transform your data into a chart-ready format.
        Review the preview below to ensure it matches your expectations.
      </Typography>

      {/* Chart Preview */}
      {chartData && chartType && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, height: 300 }}>
          <Typography variant="subtitle2" gutterBottom>
            Chart Preview
          </Typography>
          <Box sx={{ height: "calc(100% - 30px)" }}>
            <ChartRenderer
              chartType={chartType}
              chartData={chartData}
              chartConfig={{
                xAxisKey: "name",
                yAxisKey: "value",
                showGrid: true,
                showTooltip: true,
              }}
            />
          </Box>
        </Paper>
      )}

      {/* Python Script */}
      <Accordion defaultExpanded={false} sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Python Script</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: "grey.900",
              color: "grey.100",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              overflow: "auto",
              maxHeight: 400,
            }}
          >
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {pythonScript}
            </pre>
          </Paper>
        </AccordionDetails>
      </Accordion>

      {/* Chart Data */}
      <Accordion defaultExpanded={false} sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">
            Chart Data ({chartData?.length ?? 0} items)
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: "grey.50",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              overflow: "auto",
              maxHeight: 200,
            }}
          >
            <pre style={{ margin: 0 }}>
              {JSON.stringify(chartData, null, 2)}
            </pre>
          </Paper>
        </AccordionDetails>
      </Accordion>

      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Button
          variant="outlined"
          onClick={onRegenerate}
          disabled={isLoading}
          startIcon={<RefreshIcon />}
        >
          Regenerate Analysis
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={isLoading || !chartData}
          startIcon={<CheckIcon />}
        >
          {isLoading ? "Processing..." : "Continue to Chart Config"}
        </Button>
      </Box>
    </Box>
  );
};
```

### Step 5: Chart Config Step

Create `apps/hash-frontend/src/pages/dashboard/config-steps/chart-config-step.tsx`:

```tsx
import {
  Box,
  Button,
  Typography,
  Paper,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Grid,
} from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";

import { ChartRenderer } from "../chart-renderer";

type ChartConfigStepProps = {
  chartData: unknown[] | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
  onChartTypeChange: (type: ChartType) => void;
  onChartConfigChange: (config: ChartConfig) => void;
  onSave: () => void;
  isLoading: boolean;
  error: string | null;
};

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "area", label: "Area Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "scatter", label: "Scatter Plot" },
  { value: "radar", label: "Radar Chart" },
];

export const ChartConfigStep = ({
  chartData,
  chartType,
  chartConfig,
  onChartTypeChange,
  onChartConfigChange,
  onSave,
  isLoading,
  error,
}: ChartConfigStepProps) => {
  const dataKeys = chartData?.[0]
    ? Object.keys(chartData[0] as object)
    : [];

  const handleConfigChange = (key: keyof ChartConfig, value: unknown) => {
    onChartConfigChange({
      ...chartConfig,
      [key]: value,
    } as ChartConfig);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Configure Chart Appearance
      </Typography>

      <Grid container spacing={3}>
        {/* Chart Preview */}
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2, height: 400 }}>
            <Typography variant="subtitle2" gutterBottom>
              Preview
            </Typography>
            <Box sx={{ height: "calc(100% - 30px)" }}>
              {chartData && chartType && chartConfig && (
                <ChartRenderer
                  chartType={chartType}
                  chartData={chartData}
                  chartConfig={chartConfig}
                />
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Config Options */}
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Options
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Chart Type</InputLabel>
              <Select
                value={chartType ?? "bar"}
                label="Chart Type"
                onChange={(e) => onChartTypeChange(e.target.value as ChartType)}
              >
                {CHART_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>X Axis Key</InputLabel>
              <Select
                value={chartConfig?.xAxisKey ?? ""}
                label="X Axis Key"
                onChange={(e) => handleConfigChange("xAxisKey", e.target.value)}
              >
                {dataKeys.map((key) => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Y Axis Key</InputLabel>
              <Select
                value={chartConfig?.yAxisKey ?? ""}
                label="Y Axis Key"
                onChange={(e) => handleConfigChange("yAxisKey", e.target.value)}
              >
                {dataKeys.map((key) => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="X Axis Label"
              value={chartConfig?.xAxisLabel ?? ""}
              onChange={(e) => handleConfigChange("xAxisLabel", e.target.value)}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Y Axis Label"
              value={chartConfig?.yAxisLabel ?? ""}
              onChange={(e) => handleConfigChange("yAxisLabel", e.target.value)}
              sx={{ mb: 2 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={chartConfig?.showLegend ?? true}
                  onChange={(e) => handleConfigChange("showLegend", e.target.checked)}
                />
              }
              label="Show Legend"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={chartConfig?.showGrid ?? true}
                  onChange={(e) => handleConfigChange("showGrid", e.target.checked)}
                />
              }
              label="Show Grid"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={chartConfig?.showTooltip ?? true}
                  onChange={(e) => handleConfigChange("showTooltip", e.target.checked)}
                />
              }
              label="Show Tooltip"
            />
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={isLoading}
          startIcon={<SaveIcon />}
          size="large"
        >
          {isLoading ? "Saving..." : "Save Chart"}
        </Button>
      </Box>
    </Box>
  );
};
```

### Step 6: Main Modal Container

Create `apps/hash-frontend/src/pages/dashboard/item-config-modal.tsx`:

```tsx
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  Box,
  LinearProgress,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import type { EntityId, WebId } from "@blockprotocol/type-system";

import { GoalInputStep } from "./config-steps/goal-input-step";
import { QueryPreviewStep } from "./config-steps/query-preview-step";
import { AnalysisPreviewStep } from "./config-steps/analysis-preview-step";
import { ChartConfigStep } from "./config-steps/chart-config-step";
import {
  useDashboardItemConfig,
  type ConfigStep,
} from "./hooks/use-dashboard-item-config";

type ItemConfigModalProps = {
  open: boolean;
  onClose: () => void;
  itemEntityId: EntityId;
  webId: WebId;
  initialGoal?: string;
};

const STEPS: { key: ConfigStep; label: string }[] = [
  { key: "goal", label: "Define Goal" },
  { key: "query", label: "Review Query" },
  { key: "analysis", label: "Review Analysis" },
  { key: "chart", label: "Configure Chart" },
];

const getStepIndex = (step: ConfigStep): number => {
  const index = STEPS.findIndex((s) => s.key === step);
  return index >= 0 ? index : 0;
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
            error={state.error}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ItemConfigModal;
```

### Step 7: Integrate with Dashboard Page

Update `apps/hash-frontend/src/pages/dashboard/[dashboardId].page.tsx` to include the modal:

```tsx
// Add imports
import { useState } from "react";
import { ItemConfigModal } from "./item-config-modal";

// Inside the component, add state for modal:
const [configModalOpen, setConfigModalOpen] = useState(false);
const [selectedItem, setSelectedItem] = useState<DashboardItemData | null>(null);

// Update handler:
const handleItemConfigureClick = useCallback((item: DashboardItemData) => {
  setSelectedItem(item);
  setConfigModalOpen(true);
}, []);

// Add modal to JSX:
{selectedItem && (
  <ItemConfigModal
    open={configModalOpen}
    onClose={() => {
      setConfigModalOpen(false);
      setSelectedItem(null);
    }}
    itemEntityId={selectedItem.entityId}
    webId={dashboard.entityId.split("~")[0] as any}
    initialGoal={selectedItem.userGoal}
  />
)}
```

---

## Completion Criteria

- [ ] All step components created
- [ ] Configuration hook with mock data flow
- [ ] Modal with stepper navigation
- [ ] Integration with dashboard page
- [ ] Step transitions work correctly
- [ ] `yarn lint:tsc` passes
- [ ] `yarn lint:eslint` passes

## Interface for Other Agents

This UI uses mock data by default. To integrate with real backend:

1. Replace mock calls in `use-dashboard-item-config.ts` with actual GraphQL mutations:
   - `configureDashboardItem` mutation (from Agent 3)
   - Polling for workflow completion status

2. The hook should:
   - Call `configureDashboardItem` mutation to start the workflow
   - Poll for status updates
   - Display real data as it becomes available

## Future Enhancements

- Add ability to go back to previous steps
- Add manual query editing for advanced users
- Add Python script editing
- Add color picker for chart colors
- Add chart title/subtitle configuration
- Add data filtering options
