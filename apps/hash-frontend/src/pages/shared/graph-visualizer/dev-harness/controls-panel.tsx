/**
 * Floating panel of fixture and streaming knobs for the dev harness: sliders for the
 * fixture knobs, the streaming toggle and its chunk controls, and the Regenerate
 * button.
 */
import { Box, Slider, Stack, Switch, Typography } from "@mui/material";
import { memo, useState } from "react";

import { Button } from "../../../../shared/ui";
import { TOGGLEABLE_LAYER_KINDS } from "../render/scene/layer-kinds";

import type { LayerKind } from "../render/scene/layer-kinds";

/**
 * The full knob set the harness drives the generator with. Layout/worker
 * tuning lives in the separate config panel
 * ({@link "./config-panel"}), not here.
 */
export interface HarnessKnobs {
  readonly entityCount: number;
  readonly entityTypeCount: number;
  readonly linkDensity: number;
  readonly rootFraction: number;
  readonly hubCount: number;
  readonly stream: boolean;
  readonly chunkSize: number;
  readonly intervalMs: number;
}

interface ControlsPanelProps {
  readonly knobs: HarnessKnobs;
  readonly onChange: (knobs: HarnessKnobs) => void;
  readonly onRegenerate: () => void;
  /**
   * Optional callback: download the live layout as replayable JSON. Omitted
   * until a worker handle exists.
   */
  readonly onCaptureFixture?: () => void;
  /**
   * render-bench debug hook: capture deck stats + layer-push timings for a
   * fixed window under a scripted zoom sweep (report JSON in the console).
   */
  readonly onRunRenderBench?: () => void;
  /**
   * As above but without the scripted camera: benches the CURRENT viewport
   * as framed by the user, isolating fill-rate cost at one zoom.
   */
  readonly onRunRenderBenchPinned?: () => void;
  /** Layer kinds currently hidden from every render pass (GPU-cost bisection). */
  readonly hiddenLayerKinds?: readonly LayerKind[];
  /** Toggle one layer kind's visibility. */
  readonly onToggleLayerKind?: (kind: LayerKind) => void;
  /** Summary line of the last render bench (or its in-progress notice). */
  readonly renderBenchStatus?: string;
  /** Entities handed to the visualizer so far, shown against the total while streaming. */
  readonly streamedCount: number;
  readonly totalCount: number;
  readonly seed: number;
}

interface KnobSliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

const KnobSlider = memo(
  ({ label, value, min, max, step, disabled, onChange }: KnobSliderProps) => (
    <Box>
      <Stack direction="row" justifyContent="space-between" mb={0.25}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "gray.80" }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "gray.60" }}>{value}</Typography>
      </Stack>
      <Slider
        size="small"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(_event, next) => {
          // MUI Slider onChange passes number for a single-thumb slider.
          onChange(Array.isArray(next) ? next[0]! : next);
        }}
      />
    </Box>
  ),
);

export const ControlsPanel = memo(
  ({
    knobs,
    onChange,
    onRegenerate,
    onCaptureFixture,
    onRunRenderBench,
    onRunRenderBenchPinned,
    hiddenLayerKinds,
    onToggleLayerKind,
    renderBenchStatus,
    streamedCount,
    totalCount,
    seed,
  }: ControlsPanelProps) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const set = (patch: Partial<HarnessKnobs>) => {
      onChange({ ...knobs, ...patch });
    };

    return (
      <Box
        sx={({ palette, boxShadows }) => ({
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          width: isCollapsed ? 232 : 280,
          maxHeight: "calc(100% - 32px)",
          overflowY: "auto",
          p: isCollapsed ? 1.25 : 2,
          borderRadius: 2,
          bgcolor: palette.common.white,
          border: `1px solid ${palette.gray[20]}`,
          boxShadow: boxShadows.md,
        })}
      >
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={1}
          mb={isCollapsed ? 0 : 1.5}
        >
          <Box>
            <Typography
              sx={{ fontSize: 14, fontWeight: 700, color: "gray.90" }}
            >
              Graph visualizer dev harness
            </Typography>
            <Typography sx={{ fontSize: 11, color: "gray.60", mt: 0.25 }}>
              Seed {seed} - {streamedCount} / {totalCount} visible
            </Typography>
          </Box>
          <Button
            variant="tertiary"
            size="xs"
            onClick={() => setIsCollapsed((previous) => !previous)}
          >
            {isCollapsed ? "Show" : "Hide"}
          </Button>
        </Stack>

        {isCollapsed ? null : (
          <Stack spacing={1.5}>
            <KnobSlider
              label="Entity count"
              value={knobs.entityCount}
              min={10}
              max={20000}
              step={10}
              onChange={(entityCount) => set({ entityCount })}
            />
            <KnobSlider
              label="Entity type count"
              value={knobs.entityTypeCount}
              min={1}
              max={8}
              step={1}
              onChange={(entityTypeCount) => set({ entityTypeCount })}
            />
            <KnobSlider
              label="Link density (per node)"
              value={knobs.linkDensity}
              min={0}
              max={3}
              step={0.1}
              onChange={(linkDensity) => set({ linkDensity })}
            />
            <KnobSlider
              label="Root fraction"
              value={knobs.rootFraction}
              min={0}
              max={1}
              step={0.05}
              onChange={(rootFraction) => set({ rootFraction })}
            />
            <KnobSlider
              label="Hub count"
              value={knobs.hubCount}
              min={0}
              max={20}
              step={1}
              onChange={(hubCount) => set({ hubCount })}
            />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography
                sx={{ fontSize: 12, fontWeight: 600, color: "gray.80" }}
              >
                Stream incrementally
              </Typography>
              <Switch
                size="small"
                checked={knobs.stream}
                onChange={(event) => set({ stream: event.target.checked })}
              />
            </Stack>

            {knobs.stream ? (
              <>
                <KnobSlider
                  label="Chunk size"
                  value={knobs.chunkSize}
                  min={1}
                  max={200}
                  step={1}
                  onChange={(chunkSize) => set({ chunkSize })}
                />
                <KnobSlider
                  label="Interval (ms)"
                  value={knobs.intervalMs}
                  min={20}
                  max={1000}
                  step={10}
                  onChange={(intervalMs) => set({ intervalMs })}
                />
                <Typography sx={{ fontSize: 11, color: "gray.60" }}>
                  Streamed {streamedCount} / {totalCount}
                </Typography>
              </>
            ) : null}

            <Button variant="primary" size="small" onClick={onRegenerate}>
              Regenerate
            </Button>
            {onCaptureFixture ? (
              <Button variant="tertiary" size="xs" onClick={onCaptureFixture}>
                Capture layout fixture (JSON)
              </Button>
            ) : null}
            {onRunRenderBench ? (
              <Button variant="tertiary" size="xs" onClick={onRunRenderBench}>
                Render bench (10s zoom sweep)
              </Button>
            ) : null}
            {onRunRenderBenchPinned ? (
              <Button
                variant="tertiary"
                size="xs"
                onClick={onRunRenderBenchPinned}
              >
                Render bench (10s, current camera)
              </Button>
            ) : null}
            {onToggleLayerKind ? (
              <Box>
                <Typography sx={{ fontSize: 11, color: "gray.60", mb: 0.5 }}>
                  Hide layers (GPU-cost bisection)
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {TOGGLEABLE_LAYER_KINDS.map((kind) => {
                    const hidden = hiddenLayerKinds?.includes(kind) ?? false;
                    return (
                      <Button
                        key={kind}
                        variant={hidden ? "primary" : "tertiary"}
                        size="xs"
                        onClick={() => onToggleLayerKind(kind)}
                      >
                        {kind}
                      </Button>
                    );
                  })}
                </Stack>
              </Box>
            ) : null}
            {renderBenchStatus ? (
              <Typography sx={{ fontSize: 11, color: "gray.60" }}>
                {renderBenchStatus}
              </Typography>
            ) : null}
          </Stack>
        )}
      </Box>
    );
  },
);
