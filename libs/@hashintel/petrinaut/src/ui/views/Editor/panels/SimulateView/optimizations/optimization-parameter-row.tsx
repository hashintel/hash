import { NumberInput, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SegmentGroup } from "../../../../../components/segment-group";

import type { ScenarioParameter } from "@hashintel/petrinaut-core";

export type OptimizationParameterDraft = {
  mode: "fixed" | "optimize";
  fixedValue: number | boolean | null;
  minimum: number | null;
  maximum: number | null;
  step: number | null;
  scale: "linear" | "log";
};

const rowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  padding: "3",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const identityStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  minWidth: "[0]",
});

const nameStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  fontFamily: "mono",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const typeStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const modeStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
});

const fieldsStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  gap: "2",
});

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const fieldLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const booleanHintStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

function typeLabel(type: ScenarioParameter["type"]): string {
  switch (type) {
    case "real":
      return "Real";
    case "integer":
      return "Integer";
    case "boolean":
      return "Boolean";
    case "ratio":
      return "Ratio";
  }
}

export function createOptimizationParameterDraft(
  parameter: ScenarioParameter,
): OptimizationParameterDraft {
  return {
    mode: "fixed",
    fixedValue:
      parameter.type === "boolean"
        ? parameter.default !== 0
        : parameter.default,
    minimum: parameter.type === "ratio" ? 0 : null,
    maximum: parameter.type === "ratio" ? 1 : null,
    step: parameter.type === "integer" ? 1 : null,
    scale: "linear",
  };
}

export const OptimizationParameterRow = ({
  parameter,
  draft,
  onChange,
}: {
  parameter: ScenarioParameter;
  draft: OptimizationParameterDraft;
  onChange: (draft: OptimizationParameterDraft) => void;
}) => {
  const patch = (update: Partial<OptimizationParameterDraft>) =>
    onChange({ ...draft, ...update });
  const numericMinimum =
    parameter.type === "ratio" ? 0 : Number.MIN_SAFE_INTEGER;

  return (
    <div className={rowStyle}>
      <div className={headerStyle}>
        <div className={identityStyle}>
          <span className={nameStyle}>{parameter.identifier}</span>
          <span className={typeStyle}>{typeLabel(parameter.type)}</span>
        </div>
        <div className={modeStyle}>
          Optimize
          <Toggle
            aria-label={`Optimize ${parameter.identifier}`}
            size="sm"
            value={draft.mode === "optimize"}
            onChange={(enabled) =>
              patch({ mode: enabled ? "optimize" : "fixed" })
            }
          />
        </div>
      </div>

      {draft.mode === "fixed" ? (
        <div className={fieldStyle}>
          <span className={fieldLabelStyle}>Fixed value</span>
          {parameter.type === "boolean" ? (
            <Toggle
              aria-label={`${parameter.identifier} fixed value`}
              size="sm"
              value={draft.fixedValue === true}
              onChange={(fixedValue) => patch({ fixedValue })}
            />
          ) : (
            <NumberInput
              size="sm"
              min={numericMinimum}
              max={parameter.type === "ratio" ? 1 : undefined}
              step={parameter.type === "integer" ? 1 : "any"}
              value={
                typeof draft.fixedValue === "number" ? draft.fixedValue : null
              }
              onChange={(fixedValue) => patch({ fixedValue })}
            />
          )}
        </div>
      ) : parameter.type === "boolean" ? (
        <span className={booleanHintStyle}>
          The optimizer will try both false and true.
        </span>
      ) : (
        <div className={fieldsStyle}>
          <div className={fieldStyle}>
            <span className={fieldLabelStyle}>Minimum</span>
            <NumberInput
              size="sm"
              min={numericMinimum}
              max={parameter.type === "ratio" ? 1 : undefined}
              step={parameter.type === "integer" ? 1 : "any"}
              value={draft.minimum}
              onChange={(minimum) => patch({ minimum })}
            />
          </div>
          <div className={fieldStyle}>
            <span className={fieldLabelStyle}>Maximum</span>
            <NumberInput
              size="sm"
              min={numericMinimum}
              max={parameter.type === "ratio" ? 1 : undefined}
              step={parameter.type === "integer" ? 1 : "any"}
              value={draft.maximum}
              onChange={(maximum) => patch({ maximum })}
            />
          </div>
          {parameter.type === "integer" ? (
            <div className={fieldStyle}>
              <span className={fieldLabelStyle}>Step</span>
              <NumberInput
                size="sm"
                min={1}
                step={1}
                value={draft.step}
                onChange={(step) => patch({ step })}
              />
            </div>
          ) : null}
          <div className={fieldStyle}>
            <span className={fieldLabelStyle}>Scale</span>
            <SegmentGroup
              size="sm"
              value={draft.scale}
              options={[
                { value: "linear", label: "Linear" },
                { value: "log", label: "Log" },
              ]}
              onChange={(scale) => {
                const nextScale = scale as "linear" | "log";
                patch({
                  scale: nextScale,
                  ...(parameter.type === "integer" && nextScale === "log"
                    ? { step: 1 }
                    : {}),
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
