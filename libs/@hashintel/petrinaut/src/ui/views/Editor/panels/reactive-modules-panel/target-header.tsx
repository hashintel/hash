import { Select, type SelectItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

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

export type TargetControlId = "shape" | "marking" | "control";

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
  /** The step length a stochastic rate is tested over; `null` for a plain net. */
  dt: number | null;
};

const SHAPE_ITEMS: SelectItem<string>[] = [
  { value: "monolithic", text: "Monolithic" },
  { value: "modular", text: "Modular" },
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
  const stochastic = document?.kind === "stochastic";
  const controllable =
    document !== null &&
    Object.values(document.transitions).some(
      (transition) => transition.controllable === true,
    );
  return {
    controls: [
      { id: "shape", label: "Shape", value: target.shape, items: SHAPE_ITEMS },
      {
        id: "marking",
        label: "Marking",
        // A plain net counts tokens in Int whatever the flag says.
        value: stochastic ? target.marking : "int",
        items: MARKING_ITEMS,
        ...(stochastic
          ? {}
          : { disabledReason: "A plain net's marking is always Int" }),
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
    dt: stochastic ? target.dt : null,
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

const dtStyle = css({
  marginLeft: "auto",
  whiteSpace: "nowrap",
  color: "neutral.s100",
});

export const TargetHeader = ({
  target,
  document,
  onChange,
}: {
  target: ResolvedZerothTarget;
  document: PetriNetIr | null;
  onChange: (patch: ZerothTarget) => void;
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
      {model.dt === null ? null : (
        <span className={dtStyle} title="From Simulation Settings">
          dt {model.dt}
        </span>
      )}
    </div>
  );
};
