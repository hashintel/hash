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
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[-2px 0 6px rgba(0, 220, 255, 0), 2px 0 6px rgba(255, 0, 128, 0)]",
  transition: "[border-color 160ms ease, box-shadow 200ms ease]",
  "&[data-optimizing='true']": {
    borderColor: "neutral.s80",
    boxShadow:
      "[-2px 0 6px rgba(0, 220, 255, 0.03), 2px 0 6px rgba(255, 0, 128, 0.045)]",
    animationName: "[optimizationGlow]",
    animationDuration: "[2s]",
    animationTimingFunction: "linear",
    animationIterationCount: "[infinite]",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "[none]",
    },
  },
});

const identityStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  minWidth: "[0]",
  paddingLeft: "1",
});

const fixedIdentityStyle = css({
  flex: "[1 1 12rem]",
});

const nameStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s110",
  fontFamily: "mono",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  transition: "[color 160ms ease]",
  "&[data-optimizing='true']": {
    color: "purple.s115",
  },
});

const typeStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const modeStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: "0",
  gap: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  whiteSpace: "nowrap",
});

const fixedRowStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "nowrap",
  gap: "2",
});

const fixedFieldStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto minmax(5rem, 1fr)]",
  alignItems: "center",
  gap: "2",
  flex: "[0 1 13rem]",
  minWidth: "[9rem]",
  opacity: "1",
  transition: "[opacity 120ms ease-in-out]",
  "&[data-visible='false']": {
    opacity: "0",
    pointerEvents: "none",
  },
});

const fieldsStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
  gap: "2",
});

const expansionStyle = css({
  display: "grid",
  gridTemplateRows: "[0fr]",
  opacity: "0",
  transition:
    "[grid-template-rows 180ms ease-in-out, opacity 120ms ease-in-out]",
  "&[data-expanded='true']": {
    gridTemplateRows: "[1fr]",
    opacity: "1",
  },
});

const expansionClipStyle = css({
  minHeight: "0",
  overflow: "hidden",
});

const expansionBodyStyle = css({
  paddingTop: "1",
});

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const scaleControlStyle = css({
  "& [data-part='item']": {
    height: "6",
  },
});

const fieldLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
  paddingLeft: "1",
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
  const optimizing = draft.mode === "optimize";
  const identity = (
    <div className={`${identityStyle} ${fixedIdentityStyle}`}>
      <span className={nameStyle} data-optimizing={optimizing}>
        {parameter.identifier}
      </span>
      <span className={typeStyle}>{typeLabel(parameter.type)}</span>
    </div>
  );
  const modeControl = (
    <div className={modeStyle}>
      Optimize
      <Toggle
        aria-label={`Optimize ${parameter.identifier}`}
        size="sm"
        value={optimizing}
        onChange={(enabled) => patch({ mode: enabled ? "optimize" : "fixed" })}
      />
    </div>
  );

  return (
    <div className={rowStyle} data-optimizing={optimizing}>
      <div className={fixedRowStyle}>
        {identity}
        <div
          className={fixedFieldStyle}
          data-visible={!optimizing}
          aria-hidden={optimizing}
        >
          <span className={fieldLabelStyle}>Value</span>
          {parameter.type === "boolean" ? (
            <Toggle
              aria-label={`${parameter.identifier} fixed value`}
              disabled={optimizing}
              size="sm"
              value={draft.fixedValue === true}
              onChange={(fixedValue) => patch({ fixedValue })}
            />
          ) : (
            <NumberInput
              disabled={optimizing}
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
        {modeControl}
      </div>

      <div
        className={expansionStyle}
        data-expanded={optimizing}
        aria-hidden={!optimizing}
      >
        <div className={expansionClipStyle}>
          <div className={expansionBodyStyle}>
            {parameter.type === "boolean" ? (
              <span className={booleanHintStyle}>
                The optimizer will try both false and true.
              </span>
            ) : (
              <div className={fieldsStyle}>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>Minimum</span>
                  <NumberInput
                    disabled={!optimizing}
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
                    disabled={!optimizing}
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
                      disabled={!optimizing}
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
                  <div className={scaleControlStyle}>
                    <SegmentGroup
                      disabled={!optimizing}
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
                          ...(parameter.type === "integer" &&
                          nextScale === "log"
                            ? { step: 1 }
                            : {}),
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
