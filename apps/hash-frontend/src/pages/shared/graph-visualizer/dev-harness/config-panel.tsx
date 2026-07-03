/**
 * Dev-harness panel exposing every {@link VizConfig} value as an adjustable
 * knob, so layout/tuning changes can be tried live without editing code.
 *
 * The knob list is derived from {@link defaultVizConfig} itself (every numeric
 * field gets a slider + exact-entry input, booleans get a switch), so new
 * config fields show up here automatically: named sections below only control
 * grouping/order, and any field they miss lands in a trailing "Other" section.
 *
 * Edits are validated with {@link validateConfig} before they are applied;
 * an invalid draft stays local (worker keeps the last valid config) with the
 * validation error shown until a knob change makes it valid again. Applied
 * configs reach the live worker (UPDATE_CONFIG), which re-lays out in place,
 * keeping the ingested graph and the camera. "Copy JSON" exports the full
 * applied config for pasting into code or a bug report.
 */
import { Box, Slider, Stack, Switch, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { TextField } from "@hashintel/design-system";

import { Button } from "../../../../shared/ui";
import { defaultVizConfig, validateConfig } from "../config";

import type { VizConfig } from "../config";

/** `["fieldName"]` for top-level fields, `["groupName", "fieldName"]` for grouped ones. */
type FieldPath = readonly [string] | readonly [string, string];

interface SectionSpec {
  readonly title: string;
  /** Top-level flat field names, in display order. */
  readonly fields?: readonly string[];
  /** A nested config-group key whose own fields are all displayed. */
  readonly group?: string;
}

/**
 * Display grouping for the flat (ungrouped) VizConfig fields plus the nested
 * config groups. Purely presentational; completeness is guaranteed by the
 * "Other" fallback computed below.
 */
const SECTIONS: readonly SectionSpec[] = [
  {
    title: "Mode tiers",
    fields: [
      "flatLayoutMaxNodes",
      "flatLayoutExitNodes",
      "communityColorMaxNodes",
      "communityColorExitNodes",
    ],
  },
  {
    title: "Cluster grouping",
    fields: [
      "minStandaloneTypeSet",
      "mergeJaccardMin",
      "mergeSubsetJaccardMin",
      "maxChildrenPerParent",
    ],
  },
  {
    title: "Subdivision & reveal",
    fields: [
      "subclusterAboveCount",
      "entityRevealMax",
      "forceMaxNodes",
      "communityWorkerNodeCap",
      "communityMinSize",
      "communityMaxSize",
    ],
  },
  {
    title: "LOD open/close",
    fields: [
      "openChildrenFraction",
      "closeChildrenFraction",
      "openEntitiesFraction",
      "closeEntitiesFraction",
    ],
  },
  {
    title: "Embedding",
    fields: [
      "embeddingProjectionDims",
      "embeddingMaxK",
      "embeddingTargetLeafFillRatio",
      "embeddingClientNodeCap",
      "embeddingMinConcentration",
    ],
  },
  {
    title: "Ports",
    fields: [
      "minPortSpacingPx",
      "maxPortsPerCluster",
      "portPaddingWorld",
      "portTension",
    ],
  },
  {
    title: "Render budgets",
    fields: [
      "maxRenderedClusters",
      "maxRenderedEntities",
      "maxRenderedEdges",
      "maxParallelEdgeTypes",
    ],
  },
  {
    title: "Edge geometry",
    fields: ["parallelEdgeSpacingPx", "parallelEdgeCurvature", "curveSegments"],
  },
  { title: "Majorization (community force)", group: "majorization" },
  { title: "Flat force (WebCola)", group: "flatForce" },
  { title: "Top-level polish", group: "topLevelPolish" },
  { title: "Untangle", group: "untangle" },
  { title: "Cluster force (WebCola)", group: "clusterForce" },
  { title: "Entity force (d3)", group: "entityForce" },
  { title: "Cluster sizing", group: "clusterSizing" },
  { title: "Entity style", group: "entityStyle" },
  { title: "Stability", group: "stability" },
  { title: "Ingest", group: "ingest" },
  { title: "Diagnostics", fields: ["debug"] },
];

/**
 * Any defaultVizConfig field the sections above don't mention: scalars join a
 * trailing "Other" section and unlisted groups get their own section, so a
 * newly added config field always has a knob without touching this file.
 */
const FALLBACK_SECTIONS: readonly SectionSpec[] = (() => {
  const listedFlat = new Set(
    SECTIONS.flatMap((section) => section.fields ?? []),
  );
  const listedGroups = new Set(
    SECTIONS.flatMap((section) => (section.group ? [section.group] : [])),
  );
  const orphanFlat: string[] = [];
  const orphanGroups: SectionSpec[] = [];
  for (const [key, value] of Object.entries(defaultVizConfig)) {
    if (value !== null && typeof value === "object") {
      if (!listedGroups.has(key)) {
        orphanGroups.push({ title: key, group: key });
      }
    } else if (!listedFlat.has(key)) {
      orphanFlat.push(key);
    }
  }
  return [
    ...orphanGroups,
    ...(orphanFlat.length > 0 ? [{ title: "Other", fields: orphanFlat }] : []),
  ];
})();

const ALL_SECTIONS: readonly SectionSpec[] = [
  ...SECTIONS,
  ...FALLBACK_SECTIONS,
];

const asRecord = (config: VizConfig): Record<string, unknown> =>
  config as unknown as Record<string, unknown>;

function getAtPath(config: VizConfig, path: FieldPath): unknown {
  const record = asRecord(config);
  if (path.length === 1) {
    return record[path[0]];
  }
  return (record[path[0]] as Record<string, unknown> | undefined)?.[path[1]];
}

function setAtPath(
  config: VizConfig,
  path: FieldPath,
  value: unknown,
): VizConfig {
  if (path.length === 1) {
    return { ...config, [path[0]]: value };
  }
  const group = asRecord(config)[path[0]] as Record<string, unknown>;
  return { ...config, [path[0]]: { ...group, [path[1]]: value } };
}

/** Round to 1/2/5 × a power of ten, the usual "nice" slider increments. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const mantissa = raw / power;
  return (mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1) * power;
}

interface SliderRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/**
 * Infer a usable slider range from a field's default value: fractions sweep
 * toward [0, 1], larger magnitudes sweep [0, 4x default] (mirrored when
 * negative), byte alphas get [0, 255]. Zero defaults get no slider (no
 * scale to infer); the exact-entry input still accepts any value, including
 * beyond the slider's inferred bounds.
 */
function sliderRangeFor(
  fieldName: string,
  defaultValue: number,
): SliderRange | undefined {
  if (defaultValue === 0) {
    return undefined;
  }
  const magnitude = Math.abs(defaultValue);
  if (
    fieldName.toLowerCase().endsWith("alpha") &&
    magnitude > 1 &&
    Number.isInteger(defaultValue)
  ) {
    return { min: 0, max: 255, step: 1 };
  }
  const max =
    magnitude <= 0.25 ? magnitude * 4 : magnitude <= 1 ? 1 : magnitude * 4;
  const step =
    Number.isInteger(defaultValue) && magnitude >= 1
      ? Math.max(1, niceStep(max / 200))
      : niceStep(max / 200);
  return defaultValue < 0 ? { min: -max, max: 0, step } : { min: 0, max, step };
}

interface NumberKnobProps {
  readonly label: string;
  readonly value: number;
  readonly defaultValue: number;
  readonly onCommit: (value: number) => void;
}

/**
 * One numeric knob: a slider (when a range is inferable from the default)
 * plus an exact-entry input. Slider drags preview locally and commit on
 * release, so the live worker is not re-tuned (and re-laid-out) on every
 * drag tick; the input commits on blur or Enter. A reset button appears when
 * the value differs from the default.
 */
const NumberKnob = memo(
  ({ label, value, defaultValue, onCommit }: NumberKnobProps) => {
    const range = sliderRangeFor(label, defaultValue);
    /** In-flight slider value while dragging; undefined when idle. */
    const [dragValue, setDragValue] = useState<number>();
    const [text, setText] = useState(String(value));
    useEffect(() => {
      setText(String(value));
    }, [value]);

    const commitText = () => {
      const parsed = Number(text);
      if (Number.isFinite(parsed) && parsed !== value) {
        onCommit(parsed);
      } else {
        setText(String(value));
      }
    };

    const shown = dragValue ?? value;
    const isModified = value !== defaultValue;

    return (
      <Box>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: isModified ? 700 : 500,
              color: isModified ? "blue.70" : "gray.80",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={label}
          >
            {label}
          </Typography>
          {isModified ? (
            <Button
              variant="tertiary"
              size="xs"
              sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 10 }}
              onClick={() => onCommit(defaultValue)}
              title={`Reset to ${defaultValue}`}
            >
              reset
            </Button>
          ) : null}
          <TextField
            size="small"
            value={dragValue !== undefined ? String(dragValue) : text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitText();
                (event.target as HTMLInputElement).blur();
              }
            }}
            inputProps={{
              inputMode: "decimal",
              style: {
                fontSize: 11,
                padding: "2px 6px",
                width: 64,
                textAlign: "right",
              },
            }}
          />
        </Stack>
        {range ? (
          <Slider
            size="small"
            value={Math.min(range.max, Math.max(range.min, shown))}
            min={range.min}
            max={range.max}
            step={range.step}
            sx={{ py: 0.5 }}
            onChange={(_event, next) => {
              setDragValue(Array.isArray(next) ? next[0]! : next);
            }}
            onChangeCommitted={(_event, next) => {
              setDragValue(undefined);
              const committed = Array.isArray(next) ? next[0]! : next;
              if (committed !== value) {
                onCommit(committed);
              }
            }}
          />
        ) : null}
      </Box>
    );
  },
);

interface FieldRowProps {
  readonly path: FieldPath;
  readonly config: VizConfig;
  readonly onFieldChange: (path: FieldPath, value: unknown) => void;
}

const FieldRow = memo(({ path, config, onFieldChange }: FieldRowProps) => {
  const fieldName = path[path.length - 1]!;
  const value = getAtPath(config, path);
  const defaultValue = getAtPath(defaultVizConfig, path);

  if (typeof defaultValue === "boolean" || typeof value === "boolean") {
    const checked = Boolean(value);
    return (
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontSize: 11, fontWeight: 500, color: "gray.80" }}>
          {fieldName}
        </Typography>
        <Switch
          size="small"
          checked={checked}
          onChange={(event) => onFieldChange(path, event.target.checked)}
        />
      </Stack>
    );
  }

  if (typeof defaultValue !== "number") {
    return null;
  }

  return (
    <NumberKnob
      label={fieldName}
      value={typeof value === "number" ? value : defaultValue}
      defaultValue={defaultValue}
      onCommit={(next) => onFieldChange(path, next)}
    />
  );
});

/** Field paths a section displays, resolved against defaultVizConfig's shape. */
function sectionPaths(section: SectionSpec): FieldPath[] {
  if (section.group) {
    const group = asRecord(defaultVizConfig)[section.group];
    if (group === null || typeof group !== "object") {
      return [];
    }
    return Object.keys(group).map((field) => [section.group!, field] as const);
  }
  return (section.fields ?? []).map((field) => [field] as const);
}

function countModified(config: VizConfig, paths: readonly FieldPath[]): number {
  let modified = 0;
  for (const path of paths) {
    if (getAtPath(config, path) !== getAtPath(defaultVizConfig, path)) {
      modified += 1;
    }
  }
  return modified;
}

interface VizConfigPanelProps {
  /** The currently applied (last valid) config. */
  readonly value: VizConfig;
  /** Called with a validated config whenever a knob commit produces one. */
  readonly onApply: (next: VizConfig) => void;
}

export const VizConfigPanel = memo(
  ({ value, onApply }: VizConfigPanelProps) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [expandedSections, setExpandedSections] = useState<
      ReadonlySet<string>
    >(new Set());
    const [filter, setFilter] = useState("");
    /** Draft that failed validation; kept local so the worker stays on `value`. */
    const [invalidDraft, setInvalidDraft] = useState<VizConfig>();
    const [validationError, setValidationError] = useState<string>();
    const [copyFeedback, setCopyFeedback] = useState<string>();

    const config = invalidDraft ?? value;

    const handleFieldChange = useCallback(
      (path: FieldPath, fieldValue: unknown) => {
        // Build on the visible config so consecutive edits (e.g. fixing the
        // second half of a hysteresis pair) accumulate rather than reset.
        const next = setAtPath(invalidDraft ?? value, path, fieldValue);
        try {
          validateConfig(next);
        } catch (error) {
          setInvalidDraft(next);
          setValidationError(
            error instanceof Error ? error.message : String(error),
          );
          return;
        }
        setInvalidDraft(undefined);
        setValidationError(undefined);
        onApply(next);
      },
      [invalidDraft, value, onApply],
    );

    const handleCopyJson = useCallback(() => {
      const json = JSON.stringify(config, null, 2);
      // eslint-disable-next-line no-console -- dev harness affordance (console-copyable fallback)
      console.log("VizConfig JSON:", json);
      void navigator.clipboard
        .writeText(json)
        .then(() => setCopyFeedback("Copied to clipboard"))
        .catch(() => setCopyFeedback("Clipboard blocked; JSON in console"));
      window.setTimeout(() => setCopyFeedback(undefined), 2000);
    }, [config]);

    const handleReset = useCallback(() => {
      setInvalidDraft(undefined);
      setValidationError(undefined);
      onApply(defaultVizConfig);
    }, [onApply]);

    const toggleSection = useCallback((title: string) => {
      setExpandedSections((current) => {
        const next = new Set(current);
        if (next.has(title)) {
          next.delete(title);
        } else {
          next.add(title);
        }
        return next;
      });
    }, []);

    const totalModified = useMemo(
      () =>
        countModified(
          config,
          ALL_SECTIONS.flatMap((section) => sectionPaths(section)),
        ),
      [config],
    );

    const filterQuery = filter.trim().toLowerCase();

    return (
      <Box
        sx={({ palette, boxShadows }) => ({
          position: "absolute",
          top: 56,
          right: 16,
          zIndex: 10,
          width: isCollapsed ? "auto" : 320,
          maxHeight: "calc(100% - 72px)",
          overflowY: "auto",
          p: isCollapsed ? 1 : 2,
          borderRadius: 2,
          bgcolor: palette.common.white,
          border: `1px solid ${palette.gray[20]}`,
          boxShadow: boxShadows.md,
        })}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          mb={isCollapsed ? 0 : 1}
        >
          {isCollapsed ? null : (
            <Box>
              <Typography
                sx={{ fontSize: 13, fontWeight: 700, color: "gray.90" }}
              >
                Layout config
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: "gray.60" }}>
                {totalModified === 0
                  ? "all defaults"
                  : `${totalModified} value${totalModified === 1 ? "" : "s"} modified`}
              </Typography>
            </Box>
          )}
          <Button
            variant="tertiary"
            size="xs"
            onClick={() => setIsCollapsed((previous) => !previous)}
          >
            {isCollapsed
              ? `Config${totalModified > 0 ? ` (${totalModified})` : ""}`
              : "Hide"}
          </Button>
        </Stack>

        {isCollapsed ? null : (
          <Stack spacing={1}>
            <Stack direction="row" gap={0.75}>
              <Button variant="tertiary" size="xs" onClick={handleCopyJson}>
                Copy JSON
              </Button>
              <Button
                variant="tertiary"
                size="xs"
                onClick={handleReset}
                disabled={totalModified === 0 && !invalidDraft}
              >
                Reset all
              </Button>
            </Stack>
            {copyFeedback ? (
              <Typography sx={{ fontSize: 10.5, color: "gray.60" }}>
                {copyFeedback}
              </Typography>
            ) : null}
            {validationError ? (
              <Typography sx={{ fontSize: 10.5, color: "red.70" }}>
                {validationError} — fix to apply; the worker keeps the last
                valid config.
              </Typography>
            ) : null}
            <TextField
              size="small"
              placeholder="Filter fields..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              inputProps={{
                style: { fontSize: 11.5, padding: "4px 8px" },
              }}
            />

            {ALL_SECTIONS.map((section) => {
              const paths = sectionPaths(section);
              const visiblePaths = filterQuery
                ? paths.filter(
                    (path) =>
                      path[path.length - 1]!.toLowerCase().includes(
                        filterQuery,
                      ) || section.title.toLowerCase().includes(filterQuery),
                  )
                : paths;
              if (visiblePaths.length === 0) {
                return null;
              }
              const isExpanded =
                filterQuery.length > 0 || expandedSections.has(section.title);
              const modifiedCount = countModified(config, paths);
              return (
                <Box key={section.title}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    onClick={() => toggleSection(section.title)}
                    sx={{ cursor: "pointer", userSelect: "none", py: 0.25 }}
                  >
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 600, color: "gray.90" }}
                    >
                      {section.title}
                      {modifiedCount > 0 ? (
                        <Typography
                          component="span"
                          sx={{ fontSize: 10.5, color: "blue.70", ml: 0.5 }}
                        >
                          ({modifiedCount})
                        </Typography>
                      ) : null}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: "gray.50" }}>
                      {isExpanded ? "−" : "+"}
                    </Typography>
                  </Stack>
                  {isExpanded ? (
                    <Stack spacing={0.75} sx={{ pl: 0.5, pb: 0.5 }}>
                      {visiblePaths.map((path) => (
                        <FieldRow
                          key={path.join(".")}
                          path={path}
                          config={config}
                          onFieldChange={handleFieldChange}
                        />
                      ))}
                    </Stack>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    );
  },
);
