import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Modal as BaseModal } from "@hashintel/design-system";
import {
  Button,
  PortalContainerContext,
  TextInput,
} from "@hashintel/ds-components";
import { getChartConfigProblems } from "@local/hash-isomorphic-utils/chart-config-validation";
import { normalizeStructuralQuery } from "@local/hash-isomorphic-utils/dashboard-types";

import { useDashboardItemConfig } from "../hooks/use-dashboard-item-config";
import {
  dashboardItemGenerationPhaseLabel,
  type DashboardItemGeneration,
  type DashboardItemGenerationPhase,
} from "../hooks/use-dashboard-item-generations";
import { ChartConfigBuilder } from "./item-config-modal/chart-config-builder";
import { ConfigAccordion } from "./item-config-modal/config-accordion";
import { StructuralQueryBuilder } from "./item-config-modal/structural-query-builder";

import type { DashboardItemInitialValues } from "../hooks/use-dashboard-item-config";
import type {
  ConfigSectionKey,
  SectionControls,
} from "./item-config-modal/config-accordion";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { ChartConfig } from "@local/hash-isomorphic-utils/dashboard-types";

type ItemConfigModalProps = {
  open: boolean;
  onClose: () => void;
  onGenerationStarted?: (generation: {
    itemEntityId: EntityId;
    flowRunId: string;
  }) => void;
  generation?: DashboardItemGeneration;
  /** `null` when configuring a new item whose entity is created lazily */
  itemEntityId: EntityId | null;
  /** Creates the item entity (and dashboard link) on first save/generate */
  createItemEntity?: () => Promise<EntityId>;
  webId: WebId;
  initialGoal?: string;
  initialValues?: DashboardItemInitialValues;
};

/**
 * Parse a JSON editor value, returning null for empty/invalid content.
 */
const tryParseJson = <T,>(value: string): T | null => {
  if (!value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

/** Outer dialog frame shadow (Figma `shadow/component/modal-outer`) */
const modalOuterShadow =
  "0px 0px 1px 0px rgba(0,0,0,0.02), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 6px 6px -3px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.03), 0px 24px 24px -12px rgba(0,0,0,0.02)";

/** Inner card shadow (Figma `shadow/component/modal-inner`) */
const modalInnerShadow =
  "0px 0px 0px 1px rgba(0,0,0,0.08), 0px 12px 32px 0px rgba(0,0,0,0.02)";

const generationProgressByPhase: Record<
  DashboardItemGenerationPhase,
  { section: ConfigSectionKey; text: string }
> = {
  "building-query": {
    section: "query",
    text: "Building data query…",
  },
  "analyzing-data": {
    section: "analysis",
    text: "Writing analysis code…",
  },
  "creating-chart-configuration": {
    section: "config",
    text: "Creating chart configuration…",
  },
  "saving-configuration": {
    section: "config",
    text: "Saving configuration…",
  },
};

export const ItemConfigModal = ({
  open,
  onClose,
  onGenerationStarted,
  generation,
  itemEntityId,
  createItemEntity,
  webId,
  initialGoal = "",
  initialValues,
}: ItemConfigModalProps) => {
  const {
    state,
    setUserGoal,
    generateQuery,
    refineConfiguration,
    saveStructuralQuery,
    savePythonScript,
    saveChartConfig,
    ensureItemEntity,
    reset,
  } = useDashboardItemConfig({
    itemEntityId,
    createItemEntity,
    webId,
    initialGoal,
    initialValues,
    onGenerationStarted,
    onComplete: () => {
      onClose();
      reset();
    },
  });

  const [expandedSection, setExpandedSection] =
    useState<ConfigSectionKey | null>(null);

  const modalRootRef = useRef<HTMLDivElement | null>(null);

  const sectionControlsRef = useRef<
    Partial<Record<ConfigSectionKey, SectionControls>>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const hadGenerationRef = useRef(false);
  const isRefinement =
    itemEntityId !== null &&
    !!initialValues?.structuralQuery &&
    !!initialValues.pythonScript &&
    !!initialValues.chartType &&
    !!initialValues.chartConfig;

  useEffect(() => {
    if (generation) {
      hadGenerationRef.current = true;
    } else if (hadGenerationRef.current) {
      hadGenerationRef.current = false;
      onClose();
      reset();
    }
  }, [generation, onClose, reset]);

  const handleSectionControlsChange = useCallback(
    (section: ConfigSectionKey, controls: SectionControls) => {
      sectionControlsRef.current[section] = controls;
    },
    [],
  );

  const handleClose = useCallback(() => {
    const generationInProgress =
      state.isLoading && state.step !== "goal" && state.step !== "complete";
    onClose();
    if (generationInProgress) {
      return;
    }
    // Reset state after a delay to avoid UI flash
    setTimeout(reset, 300);
  }, [onClose, reset, state.isLoading, state.step]);

  /**
   * Persist any sections with unsaved edits, then close. Per-section save
   * errors are surfaced inside the section, so on failure we keep the modal
   * open.
   */
  const handleSaveAndClose = useCallback(async () => {
    setIsSaving(true);
    try {
      for (const controls of Object.values(sectionControlsRef.current)) {
        if (controls.isDirty) {
          await controls.save();
        }
      }
      /**
       * Saving a new, untouched item should still create it. Section saves
       * also call this helper, which is idempotent and shares in-flight
       * creation, so this cannot create a duplicate.
       */
      await ensureItemEntity();
      handleClose();
    } catch {
      // Error already displayed inside the failed section
    } finally {
      setIsSaving(false);
    }
  }, [ensureItemEntity, handleClose]);

  const isConfiguring =
    !!generation || (state.isLoading && state.step !== "goal");
  const generationLabel = generation
    ? dashboardItemGenerationPhaseLabel(generation.phase)
    : "Generating…";
  const generationProgress = generation
    ? generationProgressByPhase[generation.phase]
    : isConfiguring
      ? generationProgressByPhase[
          state.step === "analysis"
            ? "analyzing-data"
            : state.step === "chart"
              ? "creating-chart-configuration"
              : "building-query"
        ]
      : undefined;

  // Convert state values to strings for the editors
  const displayedStructuralQuery =
    generation?.structuralQuery ?? state.structuralQuery;
  const displayedPythonScript =
    generation?.pythonScript ?? state.pythonScript ?? "";
  const displayedChartData = generation?.chartData ?? state.chartData;
  const displayedChartConfig = generation?.chartConfig ?? state.chartConfig;

  const structuralQueryString = displayedStructuralQuery
    ? JSON.stringify(displayedStructuralQuery, null, 2)
    : "";

  const chartConfigString = displayedChartConfig
    ? JSON.stringify(displayedChartConfig, null, 2)
    : "";

  const chartDataKeys = useMemo(
    () =>
      displayedChartData && displayedChartData.length > 0
        ? Object.keys(displayedChartData[0] as Record<string, unknown>)
        : [],
    [displayedChartData],
  );

  const handleSaveStructuralQuery = useCallback(
    async (value: string) => {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(value);
      } catch (error) {
        throw new Error(
          `Not saved – the query is not valid JSON: ${
            error instanceof Error ? error.message : "parse error"
          }`,
        );
      }
      // Accept both a bare filter and a { filter, traversalPaths } definition
      const definition = normalizeStructuralQuery(parsedJson);
      if (!definition) {
        throw new Error(
          "Not saved – the query must be a filter object or a { filter, traversalPaths } object",
        );
      }
      await saveStructuralQuery(definition);
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        throw new Error(
          `Not saved – the chart config is not valid JSON: ${
            error instanceof Error ? error.message : "parse error"
          }`,
        );
      }

      const problems = getChartConfigProblems(parsed, chartDataKeys);
      if (problems.length > 0) {
        throw new Error(`Not saved – ${problems.join("; ")}`);
      }

      await saveChartConfig(parsed as ChartConfig);
    },
    [chartDataKeys, saveChartConfig],
  );

  const renderQueryBuilder = useCallback(
    (value: string, onChange: (newValue: string) => void) => (
      <StructuralQueryBuilder
        value={normalizeStructuralQuery(tryParseJson<unknown>(value))}
        onChange={(definition) =>
          onChange(definition ? JSON.stringify(definition, null, 2) : "")
        }
      />
    ),
    [],
  );

  const renderChartConfigBuilder = useCallback(
    (value: string, onChange: (newValue: string) => void) => (
      <ChartConfigBuilder
        value={tryParseJson<ChartConfig>(value)}
        onChange={(config) => onChange(JSON.stringify(config, null, 2))}
        dataKeys={chartDataKeys}
      />
    ),
    [chartDataKeys],
  );

  return (
    <BaseModal
      open={open}
      onClose={handleClose}
      contentStyle={{
        p: "0 !important",
        borderRadius: "16px",
        backgroundColor: "#fcfcfc",
        boxShadow: modalOuterShadow,
        overflow: "hidden",
      }}
    >
      <PortalContainerContext.Provider value={modalRootRef}>
        <Box
          ref={modalRootRef}
          className="hash-ds-root"
          sx={{
            width: { xs: "95vw", md: "min(92vw, 960px)" },
            height: "min(84vh, 1000px)",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            p: "3px",
          }}
        >
          {/* Inner white card */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              backgroundColor: "white",
              borderRadius: "12px",
              boxShadow: modalInnerShadow,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2.5,
                py: 2,
                borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: 18,
                  fontWeight: 600,
                  lineHeight: "20px",
                  color: "#171717",
                }}
              >
                Configure Chart
              </Typography>
              <Button
                variant="ghost"
                tone="neutral"
                size="sm"
                iconName="close"
                aria-label="Close"
                onClick={handleClose}
              />
            </Box>

            {/* Body */}
            <Box
              sx={{
                p: 2.5,
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2.5,
              }}
            >
              {/* Generation input and button */}
              <Box
                component="form"
                onSubmit={(evt: React.FormEvent) => {
                  evt.preventDefault();
                  if (isRefinement) {
                    void refineConfiguration(refinementInstruction);
                  } else {
                    void generateQuery();
                  }
                }}
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    value={
                      isRefinement ? refinementInstruction : state.userGoal
                    }
                    onChange={
                      isRefinement ? setRefinementInstruction : setUserGoal
                    }
                    placeholder={
                      isRefinement
                        ? "Describe what you want to change..."
                        : "Describe what you want to visualize..."
                    }
                    disabled={isConfiguring}
                    size="md"
                    width="fullWidth"
                  />
                </Box>
                <Button
                  variant="solid"
                  tone="neutral"
                  size="sm"
                  type="submit"
                  iconName="sparkles"
                  loading={isConfiguring}
                  disabled={
                    !(
                      isRefinement ? refinementInstruction : state.userGoal
                    ).trim() || isConfiguring
                  }
                >
                  {isConfiguring
                    ? generationLabel
                    : isRefinement
                      ? "Refine"
                      : "Generate"}
                </Button>
              </Box>

              {/* Configuration accordion sections */}
              <ConfigAccordion
                structuralQuery={structuralQueryString}
                pythonScript={displayedPythonScript}
                chartConfig={chartConfigString}
                inProgress={generationProgress}
                onSaveStructuralQuery={handleSaveStructuralQuery}
                onSavePythonScript={handleSavePythonScript}
                onSaveChartConfig={handleSaveChartConfig}
                expandedSection={expandedSection}
                onExpandedSectionChange={setExpandedSection}
                onSectionControlsChange={handleSectionControlsChange}
                renderQueryBuilder={renderQueryBuilder}
                renderChartConfigBuilder={renderChartConfigBuilder}
              />

              {/* Error display */}
              {state.error && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: "8px",
                    flexShrink: 0,
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

          {/* Footer */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 1,
              px: 2,
              py: 1.5,
              flexShrink: 0,
            }}
          >
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              tone="neutral"
              size="sm"
              loading={isSaving}
              disabled={state.isLoading}
              onClick={handleSaveAndClose}
            >
              Save
            </Button>
          </Box>
        </Box>
      </PortalContainerContext.Provider>
    </BaseModal>
  );
};
