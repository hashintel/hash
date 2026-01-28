import type { EntityId, WebId } from "@blockprotocol/type-system";
import { TextField } from "@hashintel/design-system";
import type { Filter } from "@local/hash-graph-client";
import type { ChartConfig } from "@local/hash-isomorphic-utils/dashboard-types";
import { AutoAwesome as AiIcon } from "@mui/icons-material";
import { Box, CircularProgress, LinearProgress, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import { Button } from "../../../shared/ui/button";
import { Modal } from "../../../shared/ui/modal";
import { useDashboardItemConfig } from "../hooks/use-dashboard-item-config";
import { ConfigAccordion } from "./item-config-modal/config-accordion";

type ItemConfigModalProps = {
  open: boolean;
  onClose: () => void;
  itemEntityId: EntityId;
  webId: WebId;
  initialGoal?: string;
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
    saveStructuralQuery,
    savePythonScript,
    saveChartConfig,
    reset,
  } = useDashboardItemConfig({
    itemEntityId,
    webId,
    onComplete: () => {
      onClose();
      reset();
    },
  });

  const [expandedSection, setExpandedSection] = useState<
    "query" | "analysis" | "config" | null
  >(null);

  const handleClose = () => {
    onClose();
    // Reset state after a delay to avoid UI flash
    setTimeout(reset, 300);
  };

  const isConfiguring =
    state.step !== "goal" &&
    state.step !== "chart" &&
    state.step !== "complete";

  // Convert state values to strings for the editors
  const structuralQueryString = state.structuralQuery
    ? JSON.stringify(state.structuralQuery, null, 2)
    : "";

  const chartConfigString = state.chartConfig
    ? JSON.stringify(state.chartConfig, null, 2)
    : "";

  const handleSaveStructuralQuery = useCallback(
    async (value: string) => {
      try {
        const parsed = JSON.parse(value) as Filter;
        await saveStructuralQuery(parsed);
      } catch {
        // Invalid JSON - don't save
      }
    },
    [saveStructuralQuery],
  );

  const handleSavePythonScript = useCallback(
    async (value: string) => {
      await savePythonScript(value);
    },
    [savePythonScript],
  );

  const handleSaveChartConfig = useCallback(
    async (value: string) => {
      try {
        const parsed = JSON.parse(value) as ChartConfig;
        await saveChartConfig(parsed);
      } catch {
        // Invalid JSON - don't save
      }
    },
    [saveChartConfig],
  );

  const goalValue = state.userGoal || initialGoal;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      header={{ title: "Configure Chart" }}
      contentStyle={{ p: { xs: 0, md: 0 } }}
    >
      <Box>
        {state.isLoading && <LinearProgress />}

        <Box sx={{ p: 3 }}>
          {/* Generation input and button */}
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <TextField
              fullWidth
              value={goalValue}
              onChange={(event) => setUserGoal(event.target.value)}
              placeholder="Describe what you want to visualize..."
              disabled={state.isLoading}
              size="small"
            />
            <Button
              variant="primary"
              onClick={generateQuery}
              disabled={!goalValue.trim() || state.isLoading}
              startIcon={
                isConfiguring ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AiIcon />
                )
              }
              sx={{ whiteSpace: "nowrap" }}
            >
              {isConfiguring ? "Generating..." : "Generate"}
            </Button>
          </Stack>

          {/* Configuration accordion sections */}
          <ConfigAccordion
            structuralQuery={structuralQueryString}
            pythonScript={state.pythonScript ?? ""}
            chartConfig={chartConfigString}
            onSaveStructuralQuery={handleSaveStructuralQuery}
            onSavePythonScript={handleSavePythonScript}
            onSaveChartConfig={handleSaveChartConfig}
            expandedSection={expandedSection}
            onExpandedSectionChange={setExpandedSection}
            isLoading={state.isLoading}
          />

          {/* Error display */}
          {state.error && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 1,
                backgroundColor: ({ palette }) => palette.red[20],
                border: 1,
                borderColor: ({ palette }) => palette.red[70],
              }}
            >
              {state.error}
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  );
};
