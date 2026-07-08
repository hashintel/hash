import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";

import { Icon, SegmentedControl } from "@hashintel/ds-components";

import { CodeEditor, type CodeLanguage } from "../../../../shared/code-editor";

import type { ReactNode } from "react";

const sectionBorderColor = "#dfdfdf";

export type ConfigSectionKey = "query" | "analysis" | "config";

/**
 * Save controls exposed by each section so the modal footer's Save button can
 * persist any unsaved edits.
 */
export type SectionControls = {
  isDirty: boolean;
  save: () => Promise<void>;
};

type ConfigAccordionSectionProps = {
  sectionKey: ConfigSectionKey;
  title: string;
  hasContent: boolean;
  expanded: boolean;
  isLast?: boolean;
  onChange: (expanded: boolean) => void;
  initialValue: string;
  language: CodeLanguage;
  onSave: (value: string) => Promise<void>;
  onControlsChange: (
    section: ConfigSectionKey,
    controls: SectionControls,
  ) => void;
  /**
   * Optional visual builder for the section's value. Receives the current
   * (string) value and a change callback; rendered as an alternative view to
   * the code editor.
   */
  renderBuilder?: (
    value: string,
    onChange: (value: string) => void,
  ) => ReactNode;
};

const ConfigAccordionSection = ({
  sectionKey,
  title,
  hasContent,
  expanded,
  isLast = false,
  onChange,
  initialValue,
  language,
  onSave,
  onControlsChange,
  renderBuilder,
}: ConfigAccordionSectionProps) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [view, setView] = useState<"builder" | "code">(
    renderBuilder ? "builder" : "code",
  );

  /**
   * Derived rather than event-based: some builder inputs (MUI Autocomplete)
   * fire change events on mount with an unchanged value, which must not mark
   * the section dirty.
   */
  const hasUnsavedChanges = localValue !== initialValue;

  // Update local value when initial value changes (e.g., after generation or save)
  useEffect(() => {
    setLocalValue(initialValue);
    setSaveError(null);
  }, [initialValue]);

  const handleChange = useCallback((value: string) => {
    setLocalValue(value);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await onSave(localValue);
      setSaveError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save changes";
      setSaveError(message);
      throw error;
    }
  }, [localValue, onSave]);

  // Expose save controls to the modal footer
  useEffect(() => {
    onControlsChange(sectionKey, {
      isDirty: hasUnsavedChanges,
      save: handleSave,
    });
  }, [onControlsChange, sectionKey, hasUnsavedChanges, handleSave]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flexShrink: 0,
        ...(expanded && { flex: 1 }),
        ...(!isLast && {
          borderBottom: `1px solid ${sectionBorderColor}`,
        }),
      }}
    >
      {/* Section header */}
      <Box
        role="button"
        tabIndex={0}
        onClick={() => onChange(!expanded)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChange(!expanded);
          }
        }}
        sx={{
          height: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pl: 1.5,
          pr: 1.25,
          cursor: "pointer",
          backgroundColor: "white",
          ...(expanded && {
            borderBottom: `1px solid ${sectionBorderColor}`,
          }),
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: "20px",
              color: "#000",
            }}
          >
            {title}
          </Typography>
          <Box
            aria-hidden
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: hasContent ? "#46a758" : "#f5a623",
            }}
          />
          {hasUnsavedChanges && (
            <Typography
              sx={{
                fontSize: 12,
                color: ({ palette }) => palette.gray[60],
              }}
            >
              (unsaved changes)
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: "6px",
            backgroundColor: "rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#202020",
          }}
        >
          <Icon name={expanded ? "chevronUp" : "chevronDown"} size="sm" />
        </Box>
      </Box>

      {/* Section content */}
      {expanded && (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            p: 1.5,
            backgroundColor: "#fafafa",
            overflow: "auto",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexShrink: 0,
            }}
          >
            {renderBuilder ? (
              /* The ds SegmentedControl has no size prop – compact it here.
                 Panda's atomic classes carry a :not(#\#) specificity boost,
                 so the overrides need !important to take effect. */
              <Box
                sx={{
                  '& [data-scope="segment-group"][data-part="item"]': {
                    padding: "4px 10px !important",
                  },
                  '& [data-scope="segment-group"][data-part="item-text"]': {
                    fontSize: "12px !important",
                    lineHeight: "16px !important",
                  },
                }}
              >
                <SegmentedControl
                  options={[
                    { name: "Builder", value: "builder" },
                    { name: "JSON", value: "code" },
                  ]}
                  value={view}
                  onValueChange={(newView) =>
                    setView(newView as "builder" | "code")
                  }
                />
              </Box>
            ) : (
              <Box />
            )}
            {saveError && (
              <Typography
                sx={{
                  fontSize: 12,
                  color: ({ palette }) => palette.red[70],
                }}
              >
                {saveError}
              </Typography>
            )}
          </Box>

          <Box sx={{ flex: 1, minHeight: 200, overflow: "auto" }}>
            {renderBuilder && view === "builder" ? (
              renderBuilder(localValue, handleChange)
            ) : (
              <CodeEditor
                value={localValue}
                onChange={handleChange}
                height="100%"
                language={language}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

type ConfigAccordionProps = {
  structuralQuery: string;
  pythonScript: string;
  chartConfig: string;
  onSaveStructuralQuery: (value: string) => Promise<void>;
  onSavePythonScript: (value: string) => Promise<void>;
  onSaveChartConfig: (value: string) => Promise<void>;
  expandedSection: ConfigSectionKey | null;
  onExpandedSectionChange: (section: ConfigSectionKey | null) => void;
  onSectionControlsChange: (
    section: ConfigSectionKey,
    controls: SectionControls,
  ) => void;
  renderQueryBuilder?: (
    value: string,
    onChange: (value: string) => void,
  ) => ReactNode;
  renderChartConfigBuilder?: (
    value: string,
    onChange: (value: string) => void,
  ) => ReactNode;
};

export const ConfigAccordion = ({
  structuralQuery,
  pythonScript,
  chartConfig,
  onSaveStructuralQuery,
  onSavePythonScript,
  onSaveChartConfig,
  expandedSection,
  onExpandedSectionChange,
  onSectionControlsChange,
  renderQueryBuilder,
  renderChartConfigBuilder,
}: ConfigAccordionProps) => {
  const handleSectionChange = (
    section: ConfigSectionKey,
    expanded: boolean,
  ) => {
    onExpandedSectionChange(expanded ? section : null);
  };

  return (
    <Box
      sx={{
        // Only stretch to fill the modal when a section is expanded
        flex: expandedSection ? 1 : "0 0 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${sectionBorderColor}`,
        borderRadius: "12px",
        overflow: "hidden",
        backgroundColor: "white",
      }}
    >
      <ConfigAccordionSection
        sectionKey="query"
        title="Data Query"
        hasContent={!!structuralQuery.trim()}
        expanded={expandedSection === "query"}
        onChange={(expanded) => handleSectionChange("query", expanded)}
        initialValue={structuralQuery}
        language="json"
        onSave={onSaveStructuralQuery}
        onControlsChange={onSectionControlsChange}
        renderBuilder={renderQueryBuilder}
      />

      <ConfigAccordionSection
        sectionKey="analysis"
        title="Data Analysis"
        hasContent={!!pythonScript.trim()}
        expanded={expandedSection === "analysis"}
        onChange={(expanded) => handleSectionChange("analysis", expanded)}
        initialValue={pythonScript}
        language="python"
        onSave={onSavePythonScript}
        onControlsChange={onSectionControlsChange}
      />

      <ConfigAccordionSection
        sectionKey="config"
        title="Chart Config"
        hasContent={!!chartConfig.trim()}
        expanded={expandedSection === "config"}
        isLast
        onChange={(expanded) => handleSectionChange("config", expanded)}
        initialValue={chartConfig}
        language="json"
        onSave={onSaveChartConfig}
        onControlsChange={onSectionControlsChange}
        renderBuilder={renderChartConfigBuilder}
      />
    </Box>
  );
};
