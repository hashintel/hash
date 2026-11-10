/**
 * Trigger takes (5 Nov), all opt-in. With none of these flags the editor and the run view look as they do today.
 *
 * - `?triggerghost=1..4` (Q1): the three ghost nodes left of Start. 1 a column with three wires, 2 a column with one
 *   bracket, 3 a compact one-line rail with merged wires and the count at the right, 4 a fan with no wires and a
 *   "Show triggers" toggle in the canvas toolbar. On is 70%, off 25%.
 * - `?triggerstate=off`: the off variant for any canvas take (Manual off, Responsive 0). Without it a take shows all
 *   on (Manual on, Schedule 2, Responsive 1).
 * - `?triggerfired=1..4` (Q2): the trigger that fired, in a run. 1 a step with the done bar and who or what fired it,
 *   2 a green path and "Triggered by …" in the run summary, 3 selected with the panel giving the details, 4 the node
 *   giving the details.
 * - `?triggerscale=1..4` (Q4) with `?triggercount=small|100|1000` (default 1000): number-based ghosts. 1 the count
 *   as the title, 2 a rail with a trailing count ("Event"), 3 the kind then "N on · M paused", 4 one Triggers node
 *   with three number rows. `?triggerscale=panel`: the read-only Triggers panel at 1,000.
 * - `?triggernone=1..2`: no trigger can start the flow. 1 a quiet warning under the ghosts, 2 a warning on Publish.
 *   `?triggernone=2t` lays the Publish warning out as the Figma DS Toast (warning); `?triggernone=2b` puts the code DS
 *   Banner (warning, outline) inside the popover. Both are for the team: the DS has no anchored warning popover.
 * - `?triggerdistinct=1..5` (Dora, 5 Nov): trigger nodes told apart from steps, on Take 1's column. 1 a dashed
 *   outline, 2 no card, 3 a pill, 4 a lighter tone with a "Trigger" eyebrow, 5 a dotted wire into Start.
 */
import { useSyncExternalStore } from "react";

const query = new URLSearchParams(globalThis.location.search);

const takeOf = (name: string, max: number): number | null => {
  const value = Number(query.get(name));
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
};

export const triggerGhostTake = takeOf("triggerghost", 4);
export const triggerFiredTake = takeOf("triggerfired", 4);
const triggerNoneRaw = query.get("triggernone");
export const triggerNoneTake =
  triggerNoneRaw === "2t" || triggerNoneRaw === "2b"
    ? 2
    : takeOf("triggernone", 2);
/** How the Publish warning (`?triggernone=2`) is laid out. */
export const triggerNoneLayout: "popover" | "toast" | "banner" =
  triggerNoneRaw === "2t"
    ? "toast"
    : triggerNoneRaw === "2b"
      ? "banner"
      : "popover";
export const triggerDistinctTake = takeOf("triggerdistinct", 5);
export const triggerScaleTake = takeOf("triggerscale", 4);
export const triggerPanelAtScale = query.get("triggerscale") === "panel";
export const triggerStateOff = query.get("triggerstate") === "off";

export type TriggerCount = "small" | "100" | "1000";

const countValue = query.get("triggercount");
export const triggerCount: TriggerCount =
  countValue === "small" || countValue === "100" ? countValue : "1000";

/** How the ghost nodes sit left of Start under a take; null is today's column. */
export type GhostLayout = "column" | "bracket" | "rail" | "fan" | "single";

export const ghostLayout: GhostLayout | null =
  triggerScaleTake === 4
    ? "single"
    : triggerScaleTake === 2
      ? "rail"
      : triggerScaleTake
        ? "column"
        : triggerGhostTake === 2
          ? "bracket"
          : triggerGhostTake === 3
            ? "rail"
            : triggerGhostTake === 4
              ? "fan"
              : triggerGhostTake === 1 || triggerDistinctTake || triggerNoneTake
                ? "column"
                : null;

/** Any canvas take: the mock reads all on, all off (`?triggernone`) or the off variant (`?triggerstate=off`). */
export const triggerMockState: "on" | "off" | "none" | null = triggerNoneTake
  ? "none"
  : ghostLayout === null
    ? null
    : triggerStateOff
      ? "off"
      : "on";

/** MOCK counts for `?triggerscale`: Manual, then each kind's on and paused triggers. */
export const scaleCounts: Record<
  TriggerCount,
  {
    manual: boolean;
    schedule: { on: number; paused: number };
    responsive: { on: number; paused: number };
  }
> = {
  small: {
    manual: true,
    schedule: { on: 2, paused: 0 },
    responsive: { on: 1, paused: 0 },
  },
  "100": {
    manual: true,
    schedule: { on: 3, paused: 0 },
    responsive: { on: 108, paused: 4 },
  },
  "1000": {
    manual: false,
    schedule: { on: 12, paused: 2 },
    responsive: { on: 1240, paused: 44 },
  },
};

export const formatCount = (value: number) => value.toLocaleString("en-GB");

/* Take 4's "Show triggers" toolbar toggle: on by default, for this page only. */
let showTriggers = true;
const listeners = new Set<() => void>();

export const setShowTriggers = (value: boolean) => {
  showTriggers = value;
  for (const listener of listeners) {
    listener();
  }
};

export const useShowTriggers = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => showTriggers,
  );
