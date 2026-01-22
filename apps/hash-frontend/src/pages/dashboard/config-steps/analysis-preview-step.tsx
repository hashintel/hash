import type { ChartType } from "@local/hash-isomorphic-utils/dashboard-types";
import {
  Check as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Paper,
  Typography,
} from "@mui/material";

import { Button } from "../../../shared/ui/button";
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
      <Typography variant="h5" gutterBottom>
        Review Data Analysis
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Typography
        variant="smallTextParagraphs"
        sx={{ mb: 3, color: ({ palette }) => palette.gray[70] }}
      >
        The AI has generated a Python script to transform your data into a
        chart-ready format. Review the preview below to ensure it matches your
        expectations.
      </Typography>

      {/* Chart Preview */}
      {chartData && chartType && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, height: 300 }}>
          <Typography variant="smallCaps" gutterBottom>
            Chart Preview
          </Typography>
          <Box sx={{ height: "calc(100% - 30px)" }}>
            <ChartRenderer
              chartType={chartType}
              chartData={chartData}
              chartConfig={{
                categoryKey: "name",
                series: [{ type: chartType, dataKey: "value" }],
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
          <Typography variant="smallCaps">Python Script</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: ({ palette }) => palette.gray[90],
              color: ({ palette }) => palette.gray[10],
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
          <Typography variant="smallCaps">
            Chart Data ({chartData?.length ?? 0} items)
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: ({ palette }) => palette.gray[10],
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
          variant="secondary"
          onClick={onRegenerate}
          disabled={isLoading}
          startIcon={<RefreshIcon />}
        >
          Regenerate Analysis
        </Button>
        <Button
          variant="primary"
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
