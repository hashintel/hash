import { Box, Stack, Typography } from "@mui/material";

import {
  Button,
  HelpTooltip,
  Select,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { chartTypes } from "@local/hash-isomorphic-utils/dashboard-types";

import { DeleteIconButton } from "../delete-icon-button";

import type {
  ChartConfig,
  ChartType,
  EChartsSeriesConfig,
} from "@local/hash-isomorphic-utils/dashboard-types";

/** A small label above an input, matching the config modal's Figma styling. */
const Labeled = ({
  label,
  help,
  children,
}: {
  label: string;
  /** Optional explanation shown behind an info icon next to the label */
  help?: string;
  children: React.ReactNode;
}) => (
  <Stack spacing={0.5} flex={1} minWidth={0}>
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 500,
          lineHeight: "14px",
          color: "#525252",
        }}
      >
        {label}
      </Typography>
      {help && <HelpTooltip content={help} />}
    </Stack>
    {children}
  </Stack>
);

const isSixDigitHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * A native color-picker swatch paired with a hex input. An empty value means
 * "automatic" (the chart assigns a palette color).
 */
const ColorInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <Stack direction="row" spacing={0.75} alignItems="center">
    <Box
      component="label"
      title="Pick a color"
      sx={{
        width: 28,
        height: 28,
        borderRadius: "6px",
        border: "1px solid #dfdfdf",
        flexShrink: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        // Checkerboard-ish placeholder when no explicit color is set
        backgroundColor: isSixDigitHex(value) ? value : "#f0f0f0",
        ...(isSixDigitHex(value)
          ? {}
          : {
              backgroundImage:
                "linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)",
              backgroundSize: "8px 8px",
              backgroundPosition: "0 0, 4px 4px",
            }),
      }}
    >
      <Box
        component="input"
        type="color"
        value={isSixDigitHex(value) ? value : "#3b82f6"}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: "pointer",
        }}
        aria-label="Pick a color"
      />
    </Box>
    <TextInput
      size="sm"
      value={value}
      placeholder="Auto"
      onChange={onChange}
      aria-label="Color hex value"
    />
  </Stack>
);

/** Settings row with a label on the left and a switch on the right (per the Figma config modal) */
const ToggleRow = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 32,
    }}
  >
    <Typography
      sx={{ fontSize: 12, fontWeight: 500, color: "#000", lineHeight: "14px" }}
    >
      {label}
    </Typography>
    <Toggle value={value} onChange={onChange} size="sm" />
  </Box>
);

const emptyConfig: ChartConfig = {
  categoryKey: "",
  series: [{ type: "bar", dataKey: "" }],
  showLegend: false,
  showGrid: true,
  showTooltip: true,
};

type DataKeyInputProps = {
  label: string;
  value: string;
  dataKeys: string[];
  onChange: (value: string) => void;
};

/**
 * Picks a key from the chart data rows. A select when the keys are known
 * (unknown current values still display, as a disabled entry); a free-text
 * input when no data has been computed yet.
 */
const DataKeyInput = ({
  label,
  value,
  dataKeys,
  onChange,
}: DataKeyInputProps) => (
  <Labeled label={label}>
    {dataKeys.length > 0 ? (
      <Select
        size="sm"
        items={dataKeys.map((key) => ({ value: key, text: key }))}
        value={value || null}
        onChange={(newValue) => onChange(newValue ?? "")}
        placeholder="Select key…"
        aria-label={label}
      />
    ) : (
      <TextInput
        size="sm"
        value={value}
        onChange={onChange}
        placeholder="Key in the data rows"
        aria-label={label}
      />
    )}
  </Labeled>
);

type SeriesEditorProps = {
  series: EChartsSeriesConfig;
  dataKeys: string[];
  onChange: (series: EChartsSeriesConfig) => void;
  onDelete?: () => void;
};

const SeriesEditor = ({
  series,
  dataKeys,
  onChange,
  onDelete,
}: SeriesEditorProps) => {
  return (
    <Box
      sx={{
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        backgroundColor: "white",
        p: 1.5,
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <Labeled label="Type">
            <Select
              required
              size="sm"
              items={chartTypes.map((type) => ({ value: type, text: type }))}
              value={series.type}
              onChange={(type: ChartType) => onChange({ ...series, type })}
              aria-label="Series type"
            />
          </Labeled>
          <DataKeyInput
            label="Data key"
            value={series.dataKey}
            dataKeys={dataKeys}
            onChange={(dataKey) => onChange({ ...series, dataKey })}
          />
          {onDelete && (
            <Box sx={{ pb: 0.5 }}>
              <DeleteIconButton label="Delete series" onClick={onDelete} />
            </Box>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Labeled label="Name (legend)">
            <TextInput
              size="sm"
              value={series.name ?? ""}
              onChange={(newValue) =>
                onChange({ ...series, name: newValue || undefined })
              }
            />
          </Labeled>
          <Box sx={{ width: 170, flexShrink: 0 }}>
            <Labeled
              label="Color"
              help="Applied to every data point in this series (e.g. all of its bars). Leave empty to use the chart's automatic palette."
            >
              <ColorInput
                value={series.color ?? ""}
                onChange={(newValue) =>
                  onChange({ ...series, color: newValue || undefined })
                }
              />
            </Labeled>
          </Box>
        </Stack>
        {series.type === "line" && (
          <ToggleRow
            label="Smooth line"
            value={series.smooth ?? false}
            onChange={(smooth) =>
              onChange({ ...series, smooth: smooth || undefined })
            }
          />
        )}
        {series.type === "bar" && (
          <Box sx={{ width: 240 }}>
            <Labeled
              label="Stack group"
              help="Bar series with the same group name are stacked on top of each other into a single bar. Leave empty for side-by-side bars."
            >
              <TextInput
                size="sm"
                value={series.stack ?? ""}
                placeholder="e.g. total"
                onChange={(newValue) =>
                  onChange({ ...series, stack: newValue || undefined })
                }
              />
            </Labeled>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

type ChartConfigBuilderProps = {
  value: ChartConfig | null;
  onChange: (config: ChartConfig) => void;
  /** Keys present in the chart data rows, offered as suggestions */
  dataKeys?: string[];
};

/**
 * Form-based builder for the chart configuration, as an alternative to
 * editing the JSON directly.
 */
export const ChartConfigBuilder = ({
  value,
  onChange,
  dataKeys = [],
}: ChartConfigBuilderProps) => {
  const config = value ?? emptyConfig;

  const updateSeries = (index: number, series: EChartsSeriesConfig) => {
    const newSeries = [...config.series];
    newSeries[index] = series;
    onChange({ ...config, series: newSeries });
  };

  return (
    <Stack spacing={2}>
      <DataKeyInput
        label="Category key (x-axis / slice names)"
        value={config.categoryKey}
        dataKeys={dataKeys}
        onChange={(categoryKey) => onChange({ ...config, categoryKey })}
      />

      <Stack spacing={1}>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            lineHeight: "14px",
            color: "#000",
          }}
        >
          Series
        </Typography>
        {config.series.map((series, index) => (
          <SeriesEditor
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            series={series}
            dataKeys={dataKeys}
            onChange={(newSeries) => updateSeries(index, newSeries)}
            onDelete={
              config.series.length > 1
                ? () =>
                    onChange({
                      ...config,
                      series: config.series.filter(
                        (_, seriesIndex) => seriesIndex !== index,
                      ),
                    })
                : undefined
            }
          />
        ))}
        <Box>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() =>
              onChange({
                ...config,
                series: [...config.series, { type: "bar", dataKey: "" }],
              })
            }
          >
            Add series
          </Button>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Labeled label="X-axis label">
          <TextInput
            size="sm"
            value={config.xAxisLabel ?? ""}
            onChange={(newValue) =>
              onChange({ ...config, xAxisLabel: newValue || undefined })
            }
          />
        </Labeled>
        <Labeled label="Y-axis label">
          <TextInput
            size="sm"
            value={config.yAxisLabel ?? ""}
            onChange={(newValue) =>
              onChange({ ...config, yAxisLabel: newValue || undefined })
            }
          />
        </Labeled>
      </Stack>

      <Stack sx={{ maxWidth: 360 }}>
        <ToggleRow
          label="Show legend"
          value={config.showLegend ?? false}
          onChange={(showLegend) => onChange({ ...config, showLegend })}
        />
        <ToggleRow
          label="Show grid"
          value={config.showGrid ?? false}
          onChange={(showGrid) => onChange({ ...config, showGrid })}
        />
        <ToggleRow
          label="Show tooltip"
          value={config.showTooltip ?? false}
          onChange={(showTooltip) => onChange({ ...config, showTooltip })}
        />
      </Stack>
    </Stack>
  );
};
