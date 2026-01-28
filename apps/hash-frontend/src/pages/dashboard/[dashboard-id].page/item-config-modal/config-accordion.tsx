import {
  ExpandMore as ExpandMoreIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";

import { Button } from "../../../../shared/ui/button";
import { CodeEditor, type CodeLanguage } from "./code-editor";

type ConfigAccordionSectionProps = {
  title: string;
  hasContent: boolean;
  expanded: boolean;
  onChange: (expanded: boolean) => void;
  initialValue: string;
  language: CodeLanguage;
  onSave: (value: string) => Promise<void>;
  isLoading: boolean;
};

const ConfigAccordionSection = ({
  title,
  hasContent,
  expanded,
  onChange,
  initialValue,
  language,
  onSave,
  isLoading,
}: ConfigAccordionSectionProps) => {
  const statusColor = hasContent ? "green" : "orange";
  const [localValue, setLocalValue] = useState(initialValue);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Update local value when initial value changes (e.g., after generation)
  useEffect(() => {
    setLocalValue(initialValue);
    setHasUnsavedChanges(false);
  }, [initialValue]);

  const handleChange = useCallback((value: string) => {
    setLocalValue(value);
    setHasUnsavedChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    await onSave(localValue);
    setHasUnsavedChanges(false);
  }, [localValue, onSave]);

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => onChange(isExpanded)}
      sx={{
        backgroundColor: "transparent",
        boxShadow: "none",
        "&:before": {
          display: "none",
        },
        "&.Mui-expanded": {
          margin: 0,
        },
      }}
      disableGutters
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          backgroundColor: ({ palette }) => palette[statusColor][20],
          border: 1,
          borderColor: ({ palette }) => palette[statusColor][70],
          borderRadius: 1,
          minHeight: 48,
          "&.Mui-expanded": {
            minHeight: 48,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
          "& .MuiAccordionSummary-content": {
            margin: "12px 0",
          },
        }}
      >
        <Typography variant="smallTextLabels" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails
        sx={{
          p: 2,
          border: 1,
          borderTop: 0,
          borderColor: ({ palette }) => palette.gray[30],
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
        }}
      >
        <CodeEditor
          value={localValue}
          onChange={handleChange}
          height={300}
          language={language}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isLoading}
            startIcon={<SaveIcon />}
          >
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

type ConfigAccordionProps = {
  structuralQuery: string;
  pythonScript: string;
  chartConfig: string;
  onSaveStructuralQuery: (value: string) => Promise<void>;
  onSavePythonScript: (value: string) => Promise<void>;
  onSaveChartConfig: (value: string) => Promise<void>;
  expandedSection: "query" | "analysis" | "config" | null;
  onExpandedSectionChange: (
    section: "query" | "analysis" | "config" | null,
  ) => void;
  isLoading: boolean;
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
  isLoading,
}: ConfigAccordionProps) => {
  const handleSectionChange = (
    section: "query" | "analysis" | "config",
    expanded: boolean,
  ) => {
    onExpandedSectionChange(expanded ? section : null);
  };

  return (
    <Stack spacing={1.5}>
      <ConfigAccordionSection
        title="Data Query"
        hasContent={!!structuralQuery.trim()}
        expanded={expandedSection === "query"}
        onChange={(expanded) => handleSectionChange("query", expanded)}
        initialValue={structuralQuery}
        language="json"
        onSave={onSaveStructuralQuery}
        isLoading={isLoading}
      />

      <ConfigAccordionSection
        title="Data Analysis"
        hasContent={!!pythonScript.trim()}
        expanded={expandedSection === "analysis"}
        onChange={(expanded) => handleSectionChange("analysis", expanded)}
        initialValue={pythonScript}
        language="python"
        onSave={onSavePythonScript}
        isLoading={isLoading}
      />

      <ConfigAccordionSection
        title="Chart Config"
        hasContent={!!chartConfig.trim()}
        expanded={expandedSection === "config"}
        onChange={(expanded) => handleSectionChange("config", expanded)}
        initialValue={chartConfig}
        language="json"
        onSave={onSaveChartConfig}
        isLoading={isLoading}
      />
    </Stack>
  );
};
