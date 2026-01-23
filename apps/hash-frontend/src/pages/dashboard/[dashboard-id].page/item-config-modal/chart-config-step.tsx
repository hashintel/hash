import { Select, TextField } from "@hashintel/design-system";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { Save as SaveIcon } from "@mui/icons-material";
import {
  Box,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  Paper,
  Switch,
  Typography,
} from "@mui/material";

import { Button } from "../../../../shared/ui/button";
import { MenuItem } from "../../../../shared/ui/menu-item";
import { ChartRenderer } from "../chart-renderer";

type ChartConfigStepProps = {
  chartData: unknown[] | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
  onChartTypeChange: (type: ChartType) => void;
  onChartConfigChange: (config: ChartConfig) => void;
  onSave: () => void;
  isLoading: boolean;
};

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "scatter", label: "Scatter Plot" },
  { value: "heatmap", label: "Heatmap" },
  { value: "map", label: "Map" },
];

export const ChartConfigStep = ({
  chartData,
  chartType,
  chartConfig,
  onChartTypeChange,
  onChartConfigChange,
  onSave,
  isLoading,
}: ChartConfigStepProps) => {
  const dataKeys =
    chartData && chartData.length > 0
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
      <Typography variant="h5" gutterBottom>
        Configure Chart Appearance
      </Typography>

      <Grid container spacing={3}>
        {/* Chart Preview */}
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2, height: 400 }}>
            <Typography variant="smallCaps" gutterBottom>
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
            <Typography variant="smallCaps" gutterBottom>
              Options
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Chart Type</InputLabel>
              <Select
                value={chartType ?? "bar"}
                label="Chart Type"
                onChange={(event) =>
                  onChartTypeChange(event.target.value as ChartType)
                }
              >
                {CHART_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Category Key</InputLabel>
              <Select
                value={chartConfig?.categoryKey ?? ""}
                label="Category Key"
                onChange={(event) =>
                  handleConfigChange("categoryKey", event.target.value)
                }
              >
                {dataKeys.map((key) => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Value Key</InputLabel>
              <Select
                value={chartConfig?.series?.[0]?.dataKey ?? ""}
                label="Value Key"
                onChange={(event) => {
                  const currentSeries = chartConfig?.series ?? [];
                  const updatedSeries =
                    currentSeries.length > 0
                      ? [
                          {
                            ...currentSeries[0],
                            dataKey: event.target.value as string,
                          },
                          ...currentSeries.slice(1),
                        ]
                      : [
                          {
                            type: chartType ?? ("bar" as const),
                            dataKey: event.target.value as string,
                          },
                        ];
                  handleConfigChange("series", updatedSeries);
                }}
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
              onChange={(event) =>
                handleConfigChange("xAxisLabel", event.target.value)
              }
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Y Axis Label"
              value={chartConfig?.yAxisLabel ?? ""}
              onChange={(event) =>
                handleConfigChange("yAxisLabel", event.target.value)
              }
              sx={{ mb: 2 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={chartConfig?.showLegend ?? true}
                  onChange={(event) =>
                    handleConfigChange("showLegend", event.target.checked)
                  }
                />
              }
              label="Show Legend"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={chartConfig?.showGrid ?? true}
                  onChange={(event) =>
                    handleConfigChange("showGrid", event.target.checked)
                  }
                />
              }
              label="Show Grid"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={chartConfig?.showTooltip ?? true}
                  onChange={(event) =>
                    handleConfigChange("showTooltip", event.target.checked)
                  }
                />
              }
              label="Show Tooltip"
            />
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
        <Button
          variant="primary"
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
