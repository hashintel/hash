/**
 * The flow-level view of flow outputs, for `?flowoutput=4` and `=5` (inbox `picks/flow-output-mark`, open):
 * - 4: "Flow outputs" ends the Steps tree, mirroring Flow inputs at its top. Its panel lists every flagged output, each
 *   renamable, and "+ Add flow output" drills from a step to one of its outputs.
 * - 5: an Outputs card on the canvas, after the last step, lists the flagged outputs; they are marked on each step.
 */
import { useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import {
  type DraftStep,
  type EditorDocument,
  findStep,
  flaggedOutputsOf,
  flattenSteps,
  stepLabel,
  toggleOutputFlag,
} from "./document";
import { useEditor } from "./editor-context";
import { useFlowOutputTake } from "./outputs";

export const FLOW_OUTPUTS_ID = "flow-outputs";

type FlowOutput = {
  key: string;
  stepId: string;
  outputName: string;
  label: string;
  stepName: string;
};

const outputsOf = (step: DraftStep) =>
  step.kind === "action"
    ? (getCatalogEntry(step.actionDefinitionId)?.outputs ?? [])
    : [];

const flowOutputsOf = (document: EditorDocument): FlowOutput[] =>
  flaggedOutputsOf(document).flatMap((key) => {
    const [stepId = "", outputName = ""] = key.split(".");
    const step = findStep(document, stepId)?.step;
    if (!step) {
      return [];
    }
    const output = outputsOf(step).find((entry) => entry.name === outputName);
    return [
      {
        key,
        stepId,
        outputName,
        label: output?.label ?? outputName,
        stepName: stepLabel(step),
      },
    ];
  });

const titleStyle = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const leadStyle = css({
  marginTop: "1",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  marginTop: "5",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[36px]",
  paddingX: "2",
  borderRadius: "md",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "& [data-remove]": { visibility: "hidden" },
  "&:hover [data-remove]": { visibility: "visible" },
});

const nameInputStyle = css({
  flex: "1",
  minWidth: "[0]",
  height: "[28px]",
  paddingX: "1.5",
  marginX: "[-6px]",
  border: "none",
  borderRadius: "sm",
  background: "[transparent]",
  textStyle: "sm",
  color: "neutral.fg.heading",
  outline: "none",
  _hover: { boxShadow: "[inset 0 0 0 1px var(--colors-neutral-bd-subtle)]" },
  _focus: { boxShadow: "[inset 0 0 0 1px var(--colors-neutral-bd-solid)]" },
});

const fromStyle = css({
  flexShrink: 0,
  maxWidth: "[45%]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

const ghostButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
});

const removeStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  padding: "[0]",
  border: "none",
  borderRadius: "sm",
  background: "[transparent]",
  cursor: "pointer",
  color: "neutral.fg.subtle",
  _hover: { color: "neutral.fg.heading" },
});

const drillStyle = css({
  display: "flex",
  flexDirection: "column",
  marginTop: "2",
  padding: "1",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
});

const drillRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  height: "[32px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.heading",
  textAlign: "left",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "& [data-chevron]": { marginLeft: "auto", color: "neutral.fg.subtle" },
});

const drillHeadStyle = css({
  paddingX: "2",
  paddingY: "1",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

const emptyStyle = css({
  paddingX: "2",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

/** Take 4's "+ Add flow output": a step, then one of its outputs (Attio's drill picker). */
const AddFlowOutput = () => {
  const { document, setDocument } = useEditor();
  const [open, setOpen] = useState(false);
  const [stepId, setStepId] = useState<string | null>(null);
  const flagged = flaggedOutputsOf(document);
  const steps = flattenSteps(document.steps)
    .map((entry) => entry.step)
    .filter((step) => outputsOf(step).length > 0);
  const step = stepId ? findStep(document, stepId)?.step : undefined;
  return (
    <div>
      <button
        type="button"
        className={ghostButtonStyle}
        onClick={() => {
          setOpen((current) => !current);
          setStepId(null);
        }}
        data-add-flow-output
      >
        <Icon name="plus" size="sm" />
        Add flow output
      </button>
      {open ? (
        <div className={drillStyle}>
          {step ? (
            <>
              <button
                type="button"
                className={drillRowStyle}
                onClick={() => setStepId(null)}
              >
                <Icon name="chevronLeft" size="sm" />
                {stepLabel(step)}
              </button>
              {outputsOf(step).map((output) => {
                const key = `${step.stepId}.${output.name}`;
                return (
                  <button
                    key={key}
                    type="button"
                    className={drillRowStyle}
                    disabled={flagged.includes(key)}
                    onClick={() => {
                      setDocument((current) =>
                        toggleOutputFlag(current, step.stepId, output.name),
                      );
                      setOpen(false);
                    }}
                  >
                    {output.label}
                    {flagged.includes(key) ? (
                      <span data-chevron>Added</span>
                    ) : null}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <span className={drillHeadStyle}>From a step</span>
              {steps.map((entry) => (
                <button
                  key={entry.stepId}
                  type="button"
                  className={drillRowStyle}
                  onClick={() => setStepId(entry.stepId)}
                >
                  {stepLabel(entry)}
                  <span data-chevron>
                    <Icon name="chevronRight" size="sm" />
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

/** The right panel for the Flow outputs row (take 4) or the Outputs card (take 5). */
export const FlowOutputsPanel = () => {
  const { document, setDocument } = useEditor();
  const take = useFlowOutputTake();
  const [names, setNames] = useState<Record<string, string>>({});
  const outputs = flowOutputsOf(document);
  const editable = take === 4;
  return (
    <div data-flow-outputs-panel>
      <div className={titleStyle}>{editable ? "Flow outputs" : "Outputs"}</div>
      <div className={leadStyle}>
        {editable
          ? "What the flow hands back when a run ends."
          : "Marked on each step's outputs."}
      </div>
      <div className={listStyle}>
        {outputs.length === 0 ? (
          <span className={emptyStyle}>No flow outputs yet</span>
        ) : null}
        {outputs.map((output) => (
          <div key={output.key} className={rowStyle}>
            {editable ? (
              <input
                className={nameInputStyle}
                value={names[output.key] ?? output.label}
                aria-label="Flow output name"
                onChange={(event) =>
                  setNames((current) => ({
                    ...current,
                    [output.key]: event.target.value,
                  }))
                }
              />
            ) : (
              <span className={css({ flex: "1", textStyle: "sm" })}>
                {output.label}
              </span>
            )}
            <span className={fromStyle}>from {output.stepName}</span>
            {editable ? (
              <button
                type="button"
                className={removeStyle}
                data-remove
                aria-label="Remove flow output"
                onClick={() =>
                  setDocument((current) =>
                    toggleOutputFlag(current, output.stepId, output.outputName),
                  )
                }
              >
                <Icon name="close" size="sm" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {editable ? (
        <div className={css({ marginTop: "2" })}>
          <AddFlowOutput />
        </div>
      ) : null}
    </div>
  );
};

const cardStyle = css({
  width: "[240px]",
  padding: "3",
  borderRadius: "xl",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s00",
  "&[data-selected]": {
    borderColor: "[var(--flows-sel-border)]",
    boxShadow: "[inset 0 0 0 0.5px var(--flows-sel-border)]",
  },
});

const cardHeadStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  "& svg": { color: "neutral.fg.subtle" },
});

const cardRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  marginTop: "1.5",
  textStyle: "xs",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** Take 5's canvas card: the flagged outputs, after the last step. */
export const FlowOutputsCard = ({ selected }: { selected: boolean }) => {
  const { document } = useEditor();
  const outputs = flowOutputsOf(document);
  return (
    <div
      className={cardStyle}
      data-selected={selected || undefined}
      data-flow-outputs-card
    >
      <div className={cardHeadStyle}>
        <Icon name="rightToLine" size="sm" />
        Outputs
      </div>
      {outputs.length === 0 ? (
        <div className={cardRowStyle}>None marked yet</div>
      ) : (
        outputs.map((output) => (
          <div key={output.key} className={cardRowStyle}>
            <span className={css({ color: "neutral.fg.heading" })}>
              {output.label}
            </span>
            <span className={css({ color: "neutral.fg.subtle" })}>
              · {output.stepName}
            </span>
          </div>
        ))
      )}
    </div>
  );
};
