/**
 * The floating controls panel for the dev harness: sliders for the fixture knobs, the streaming
 * toggle and its chunk controls, and the Regenerate button. Pure presentation -- it reads the
 * current knob values and reports changes up; the harness owns the state and the fixture.
 */
import { Box, Slider, Stack, Switch, Typography } from "@mui/material";
import { memo, useState } from "react";

import { Button } from "../../../../shared/ui";

/** The full knob set the harness drives the generator with. */
export interface HarnessKnobs {
  readonly entityCount: number;
  readonly entityTypeCount: number;
  readonly linkDensity: number;
  readonly rootFraction: number;
  readonly hubCount: number;
  /** Which community-tier engine drives the flat layout (A/B flip). */
  readonly stressEngine: "stress" | "majorization";
  // Stress-solver force tuning (community-force flat tier; all push OUTWARD, stay overlap-free).
  readonly stressCommunityCohesion: number;
  readonly stressCommunitySeparation: number;
  readonly stressDegreeRepulsion: number;
  readonly stream: boolean;
  readonly chunkSize: number;
  readonly intervalMs: number;
}

interface ControlsPanelProps {
  readonly knobs: HarnessKnobs;
  readonly onChange: (knobs: HarnessKnobs) => void;
  readonly onRegenerate: () => void;
  /**
   * CAPTURE-LIVE-FIXTURE debug hook: serialize the live layout graph to a
   * downloadable JSON fixture (replayable via bench-fixtures.ts). Absent when
   * no worker handle is live yet.
   */
  readonly onCaptureFixture?: () => void;
  /**
   * RENDER-BENCH debug hook: capture deck stats + layer-push timings for a
   * fixed window under a scripted zoom sweep (report JSON in the console).
   */
  readonly onRunRenderBench?: () => void;
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
                Majorization engine
              </Typography>
              <Switch
                size="small"
                checked={knobs.stressEngine === "majorization"}
                onChange={(event) =>
                  set({
                    stressEngine: event.target.checked
                      ? "majorization"
                      : "stress",
                  })
                }
              />
            </Stack>
            <KnobSlider
              label="Stress community cohesion"
              value={knobs.stressCommunityCohesion}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(stressCommunityCohesion) =>
                set({ stressCommunityCohesion })
              }
            />
            <KnobSlider
              label="Stress community separation"
              value={knobs.stressCommunitySeparation}
              min={0}
              max={0.8}
              step={0.02}
              onChange={(stressCommunitySeparation) =>
                set({ stressCommunitySeparation })
              }
            />
            <KnobSlider
              label="Stress degree repulsion"
              value={knobs.stressDegreeRepulsion}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(stressDegreeRepulsion) =>
                set({ stressDegreeRepulsion })
              }
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
