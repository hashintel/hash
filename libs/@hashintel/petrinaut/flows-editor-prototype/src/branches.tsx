/**
 * Branching, as a step's output (Figma 637:22029, option B; 23 + 26 Oct syncs):
 *
 * - A step's paths are the values of one output: Ask a person's Decision is Approved or Rejected; If's Result is Yes
 *   or No. The paths hang under that output row, so they sit next to the value they branch on (Ciarán, T26), and the
 *   panel keeps its three sections.
 * - Each path is one line on the rail: a dot, the value, then the step it leads to (a chip), or "Ends here". No "→"
 *   arrows and no connecting words: the rail and the order carry it (Aakarsh, T26: not a fan of the arrows).
 * - MOCK, the stretch case (Ciarán, Dei, T26): "Add path" adds a path on several fields, e.g. Approved AND Amount over
 *   10,000 → another reviewer. It lives in this panel only: the engine has one port per value, and the canvas card
 *   does not draw the extra port.
 */
import { useState } from "react";

import { Button, Chip, type IconName } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { findStep, START_ID, stepLabel } from "./document";
import { useEditor } from "./editor-context";
import { PropertyRow, SourceChip } from "./ui";

/** The output a step branches on, per action. The engine models the values as ports. */
export const branchOutput: Record<string, { label: string; kind: string }> = {
  requestReview: { label: "Decision", kind: "Choice" },
  if: { label: "Result", kind: "Yes or no" },
};

const railStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1.5",
  minWidth: "[0]",
  paddingLeft: "2",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.subtle",
});

const pathStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1.5",
  minWidth: "[0]",
  textStyle: "sm",
  color: "neutral.fg.body",
});

/** A path's mark: a small solid dot, as the ports on the canvas card. */
const dotStyle = css({
  flexShrink: 0,
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  backgroundColor: "blue.fg.link",
});

const goesToStyle = css({ color: "neutral.fg.subtle" });

/** A two-field path: its condition on one line, where it leads on the next, under the condition. */
const extraStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const indentStyle = css({ paddingLeft: "3" });

const labelStackStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
});

type ExtraPath = { id: string };

export const BranchRows = ({
  stepId,
  actionDefinitionId,
  ports,
  iconOf,
}: {
  stepId: string;
  actionDefinitionId: string;
  ports: { outputName: string; label: string }[];
  iconOf: (id: string) => IconName;
}) => {
  const { document, setUi } = useEditor();
  const [extras, setExtras] = useState<ExtraPath[]>([]);
  const output = branchOutput[actionDefinitionId] ?? {
    label: "Paths",
    kind: ports.map((port) => port.label).join(" or "),
  };

  const targetsOf = (port: string) =>
    document.wires.filter(
      (wire) => wire.source === stepId && wire.sourcePort === port,
    );

  const nameOf = (id: string) => {
    const step = findStep(document, id)?.step;
    return step ? stepLabel(step) : id === START_ID ? "Start" : id;
  };

  const goesTo = (port: string) => {
    const targets = targetsOf(port);
    if (targets.length === 0) {
      return <span className={goesToStyle}>Ends here</span>;
    }
    return targets.map((wire) => (
      <SourceChip
        key={wire.id}
        icon={iconOf(wire.target)}
        onClick={() =>
          setUi((ui) => ({ ...ui, selectedId: wire.target, openField: null }))
        }
      >
        {nameOf(wire.target)}
      </SourceChip>
    ));
  };

  const approved = ports[0];

  return (
    <PropertyRow
      label={
        <span className={labelStackStyle}>
          <span>{output.label}</span>
          <Chip size="xs" variant="soft">
            {output.kind}
          </Chip>
        </span>
      }
    >
      <div className={railStyle}>
        {ports.map((port) => (
          <div key={port.outputName} className={pathStyle}>
            <span className={dotStyle} aria-hidden="true" />
            <span>{port.label}</span>
            {goesTo(port.outputName)}
          </div>
        ))}
        {extras.map((extra) => (
          // MOCK: a path on two fields. Shown here only; no port on the canvas.
          <div key={extra.id} className={extraStyle}>
            <span className={pathStyle}>
              <span className={dotStyle} aria-hidden="true" />
              <Chip size="md">{approved?.label ?? "Approved"}</Chip>
              <Chip size="md">AND</Chip>
              <Chip size="md">Amount is over 10,000</Chip>
            </span>
            <span className={cx(pathStyle, indentStyle)}>
              <span className={goesToStyle}>Ends here</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setExtras((current) =>
                    current.filter((candidate) => candidate.id !== extra.id),
                  )
                }
              >
                Remove
              </Button>
            </span>
          </div>
        ))}
        {actionDefinitionId === "requestReview" ? (
          <Button
            size="xs"
            variant="subtle"
            iconName="plus"
            onClick={() =>
              setExtras((current) => [...current, { id: `extra${current.length}` }])
            }
          >
            Add path
          </Button>
        ) : null}
      </div>
    </PropertyRow>
  );
};
