import { NumberInput, Select, type SelectItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type {
  PetriNetIr,
  ResolvedZerothTarget,
  ZerothTarget,
} from "@hashintel/petrinaut-core/reactive-modules";
import type { ReactNode } from "react";

/**
 * The compiler flags as a row of controls over the Python tab. What each
 * control offers, and whether it applies to the net at all, is decided by
 * `targetHeaderControls`, so the row itself only renders.
 */

export type TargetControlId = "shape" | "layout" | "marking" | "control";

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
  return {
    controls: [
      { id: "shape", label: "Shape", value: target.shape, items: SHAPE_ITEMS },
      {
        id: "layout",
        label: "Layout",
        value: target.shape === "modular" ? target.layout : "single",
        items: LAYOUT_ITEMS,
        ...(target.shape === "modular"
          ? {}
          : { disabledReason: "Layout applies to the modular shape" }),
      },
      {
        id: "marking",
        label: "Marking",
        // A plain net counts in Int, a coloured one in Real, whatever the flag says.
        value:
          coloured || dynamic ? "real" : stochastic ? target.marking : "int",
        items: MARKING_ITEMS,
        ...(stochastic && !coloured && !dynamic
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
        ...(controllable
          ? {}
          : {
              disabledReason:
                "No transition is marked controllable in its metadata",
            }),
      },
    ],
    slots: coloured ? target.slots : null,
  };
};

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "3",
  paddingX: "3",
  paddingY: "1",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
  fontSize: "[11px]",
  color: "neutral.s105",
});

const controlStyle = css({
  display: "flex",
  alignItems: "center",
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

// Whatever the tab puts at the row's end, such as the file list's toggle.
const trailingStyle = css({
  display: "flex",
  alignItems: "center",
  marginLeft: "auto",
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
  return (
    <div role="group" aria-label="Compiler flags" className={rowStyle}>
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
      {children === undefined ? null : (
        <div className={trailingStyle}>{children}</div>
      )}
    </div>
  );
};
