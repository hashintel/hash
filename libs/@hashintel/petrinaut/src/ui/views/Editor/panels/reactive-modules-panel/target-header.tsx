import { useLayoutEffect, useRef, type ReactNode } from "react";

import { NumberInput, Select, type SelectItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { zerothTargetComposes } from "@hashintel/petrinaut-core/reactive-modules";

import type {
  PetriNetIr,
  ResolvedZerothTarget,
  ZerothTarget,
} from "@hashintel/petrinaut-core/reactive-modules";

/**
 * The compiler flags as a row of controls over the Python tab. What each
 * control offers, and whether it applies to the net at all, is decided by
 * `targetHeaderControls`, so the row itself only renders.
 */

export type TargetControlId =
  | "shape"
  | "rates"
  | "layout"
  | "marking"
  | "control"
  | "syntax";

export type TargetControl = {
  id: TargetControlId;
  label: string;
  value: string;
  items: SelectItem<string>[];
  /** Set when the flag has no effect on this net, with the reason. */
  disabledReason?: string;
};

export type TargetHeaderModel = {
  controls: TargetControl[];
  /** The slots a coloured place without a capacity gets; `null` for an uncoloured net. */
  slots: number | null;
};

const SHAPE_ITEMS: SelectItem<string>[] = [
  { value: "monolithic", text: "Monolithic" },
  { value: "modular", text: "Modular" },
];

const RATES_ITEMS: SelectItem<string>[] = [
  { value: "coin", text: "Coin" },
  { value: "clock", text: "Clock" },
];

const LAYOUT_ITEMS: SelectItem<string>[] = [
  { value: "single", text: "Single file" },
  { value: "per-module", text: "File per module" },
];

const MARKING_ITEMS: SelectItem<string>[] = [
  { value: "real", text: "Real" },
  { value: "int", text: "Int" },
];

const CONTROL_ITEMS: SelectItem<string>[] = [
  { value: "closed", text: "Closed" },
  { value: "open", text: "Open" },
];

const SYNTAX_ITEMS: SelectItem<string>[] = [
  { value: "update", text: "init / update" },
  { value: "next", text: "init / next" },
];

export const targetHeaderControls = (
  target: ResolvedZerothTarget,
  document: PetriNetIr | null,
): TargetHeaderModel => {
  const stochastic = document !== null && document.kind !== "plain";
  const places = document === null ? [] : Object.values(document.places);
  const coloured = places.some((place) => place?.colour !== undefined);
  const dynamic = places.some((place) => place?.dynamics !== undefined);
  const controllable =
    document !== null &&
    Object.values(document.transitions).some(
      (transition) => transition.controllable === true,
    );
  // Clocks compose a fixed shape in continuous time, so the step flags have
  // nothing left to decide while they are on.
  const clocksApply = stochastic && !coloured && !dynamic;
  const clocks = clocksApply && target.rates === "clock";
  const composes = zerothTargetComposes({
    ...target,
    rates: clocks ? "clock" : "coin",
  });
  return {
    controls: [
      {
        id: "shape",
        label: "Shape",
        value: clocks ? "modular" : target.shape,
        items: SHAPE_ITEMS,
        ...(clocks
          ? {
              disabledReason:
                "Clocks compose one module per transition and place",
            }
          : {}),
      },
      {
        id: "rates",
        label: "Rates",
        value: clocksApply ? target.rates : "coin",
        items: RATES_ITEMS,
        ...(clocksApply
          ? {}
          : {
              disabledReason:
                coloured || dynamic
                  ? "A coloured net or one with dynamics takes coins"
                  : "A plain net has no rates",
            }),
      },
      {
        id: "layout",
        label: "Layout",
        value: composes ? target.layout : "single",
        items: LAYOUT_ITEMS,
        ...(composes
          ? {}
          : {
              disabledReason:
                "Layout applies to the modular shape or Clock rates",
            }),
      },
      {
        id: "marking",
        label: "Marking",
        // A plain net counts in Int, a coloured one in Real, whatever the flag says.
        value: clocks
          ? "int"
          : coloured || dynamic
            ? "real"
            : stochastic
              ? target.marking
              : "int",
        items: MARKING_ITEMS,
        ...(clocks
          ? { disabledReason: "Clocks count whole tokens in Nat" }
          : clocksApply
            ? {}
            : {
                disabledReason:
                  coloured || dynamic
                    ? "A coloured net or one with dynamics holds Reals"
                    : "A plain net's marking is always Int",
              }),
      },
      {
        id: "control",
        label: "Control",
        value: target.control,
        items: CONTROL_ITEMS,
        ...(!controllable
          ? {
              disabledReason:
                "No transition is marked controllable in its metadata",
            }
          : clocks
            ? { disabledReason: "Clocks take no external choice" }
            : {}),
      },
      {
        id: "syntax",
        label: "Syntax",
        value: clocks ? "next" : target.syntax,
        items: SYNTAX_ITEMS,
        ...(clocks ? { disabledReason: "Clocks use next and flow" } : {}),
      },
    ],
    slots: coloured ? target.slots : null,
  };
};

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
  fontSize: "[11px]",
  color: "neutral.s105",
});

// The flags on one line: what does not fit scrolls, and a fade on the edge
// that hides more says so. The fades follow the scroll position through the
// `data-fade-*` attributes the row keeps in step below.
const scrollShellStyle = css({
  position: "relative",
  flex: "[1]",
  minWidth: "[0]",
  _before: {
    content: '""',
    position: "absolute",
    top: "[0]",
    bottom: "[0]",
    left: "[0]",
    width: "[28px]",
    pointerEvents: "none",
    opacity: "[0]",
    transition: "[opacity 120ms ease-out]",
    background:
      "[linear-gradient(to right, {colors.neutral.s00}, transparent)]",
  },
  _after: {
    content: '""',
    position: "absolute",
    top: "[0]",
    bottom: "[0]",
    right: "[0]",
    width: "[28px]",
    pointerEvents: "none",
    opacity: "[0]",
    transition: "[opacity 120ms ease-out]",
    background: "[linear-gradient(to left, {colors.neutral.s00}, transparent)]",
  },
  '&[data-fade-left="true"]': { _before: { opacity: "[1]" } },
  '&[data-fade-right="true"]': { _after: { opacity: "[1]" } },
});

// Scrolls sideways without a scrollbar, and never hands the gesture on to the
// page, where it would navigate.
const scrollerStyle = css({
  overflowX: "auto",
  overflowY: "hidden",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "[none]",
  "&::-webkit-scrollbar": { display: "none" },
});

// Sized by its controls, so its box tells the row when the flags change.
const controlsStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[max-content]",
  gap: "3",
  paddingX: "3",
  paddingY: "1",
});

const controlStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  gap: "1",
});

const labelStyle = css({
  textTransform: "uppercase",
  fontWeight: "medium",
  letterSpacing: "[0.02em]",
  whiteSpace: "nowrap",
});

const selectStyle = css({
  minWidth: "[96px]",
});

const slotsStyle = css({
  width: "[56px]",
});

// Whatever the tab puts at the row's end, such as the file list's toggle:
// outside the scroller, so it stays in view.
const trailingStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  paddingLeft: "1",
  paddingRight: "2",
});

/** Which edges of the scroller hide more of the controls. */
export const scrollFades = (scroller: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): { left: boolean; right: boolean } => ({
  left: scroller.scrollLeft > 0,
  right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
});

export const TargetHeader = ({
  target,
  document,
  onChange,
  children,
}: {
  target: ResolvedZerothTarget;
  document: PetriNetIr | null;
  onChange: (patch: ZerothTarget) => void;
  /** Rendered at the row's end. */
  children?: ReactNode;
}) => {
  const model = targetHeaderControls(target, document);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  // The fades are DOM state kept in step with the scroller: measured on
  // mount, on every scroll, and whenever the scroller or its controls resize.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const scroller = scrollerRef.current;
    const controls = controlsRef.current;
    if (!shell || !scroller || !controls) {
      return;
    }
    const measure = () => {
      const fades = scrollFades(scroller);
      shell.dataset.fadeLeft = String(fades.left);
      shell.dataset.fadeRight = String(fades.right);
    };
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(scroller);
    observer?.observe(controls);
    return () => {
      scroller.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div role="group" aria-label="Compiler flags" className={rowStyle}>
      <div ref={shellRef} className={scrollShellStyle}>
        <div ref={scrollerRef} data-flags-scroller className={scrollerStyle}>
          <div ref={controlsRef} className={controlsStyle}>
            {model.controls.map((control) => (
              <label
                key={control.id}
                className={controlStyle}
                title={control.disabledReason}
              >
                <span className={labelStyle}>{control.label}</span>
                <Select
                  required
                  size="xs"
                  variant="subtle"
                  className={selectStyle}
                  aria-label={`${control.label} flag`}
                  disabled={control.disabledReason !== undefined}
                  value={control.value}
                  items={control.items}
                  onChange={(value: string) => {
                    onChange({ [control.id]: value } as ZerothTarget);
                  }}
                />
              </label>
            ))}
            {model.slots === null ? null : (
              <div
                className={controlStyle}
                title="Slots of a coloured place without a capacity"
              >
                <span className={labelStyle}>Slots</span>
                <NumberInput
                  size="xs"
                  hideStepper
                  min={1}
                  aria-label="Slots flag"
                  value={model.slots}
                  className={slotsStyle}
                  onChange={(value) => {
                    if (value !== null && value >= 1) {
                      onChange({ slots: Math.floor(value) });
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {children === undefined || children === null ? null : (
        <div className={trailingStyle}>{children}</div>
      )}
    </div>
  );
};
