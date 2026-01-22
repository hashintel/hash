import type { Filter } from "@local/hash-graph-client";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { Button } from "../../../shared/ui/button";

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
  const dataColumns =
    sampleData && sampleData.length > 0
      ? Object.keys(sampleData[0] as object)
      : [];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Review Generated Query
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {explanation && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 3, bgcolor: ({ palette }) => palette.gray[10] }}
        >
          <Typography variant="smallCaps" gutterBottom>
            Explanation
          </Typography>
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[70] }}
          >
            {explanation}
          </Typography>
        </Paper>
      )}

      <Accordion defaultExpanded={false} sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="smallCaps">Query Details (JSON)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: ({ palette }) => palette.gray[90],
              color: ({ palette }) => palette.gray[10],
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
          <Typography variant="smallCaps" gutterBottom>
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
                {sampleData.slice(0, 5).map((row) => {
                  const rowData = row as Record<string, unknown>;
                  // Use first column value as part of the key, with fallback to JSON string
                  const firstColValue = dataColumns[0]
                    ? rowData[dataColumns[0]]
                    : null;
                  const rowKey =
                    typeof firstColValue === "string" ||
                    typeof firstColValue === "number"
                      ? String(firstColValue)
                      : JSON.stringify(rowData);
                  return (
                    <TableRow key={rowKey}>
                      {dataColumns.map((col) => {
                        const cellValue = rowData[col];
                        let displayValue: string;
                        if (cellValue === null || cellValue === undefined) {
                          displayValue = "";
                        } else if (typeof cellValue === "string") {
                          displayValue = cellValue;
                        } else if (
                          typeof cellValue === "number" ||
                          typeof cellValue === "boolean"
                        ) {
                          displayValue = String(cellValue);
                        } else {
                          displayValue = JSON.stringify(cellValue);
                        }
                        return <TableCell key={col}>{displayValue}</TableCell>;
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {sampleData.length > 5 && (
            <Typography
              variant="microText"
              sx={{
                mt: 1,
                display: "block",
                color: ({ palette }) => palette.gray[70],
              }}
            >
              Showing 5 of {sampleData.length} rows
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Button
          variant="secondary"
          onClick={onRegenerate}
          disabled={isLoading}
          startIcon={<RefreshIcon />}
        >
          Regenerate
        </Button>
        <Button
          variant="primary"
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
