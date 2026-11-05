/**
 * Branching, as a step's output (Figma 637:22029, option B; 23 + 26 Oct syncs):
 *
 * - A step's paths are the values of one output: Ask a person's Decision is Approved or Rejected; If's Result is Yes
 *   or No. The paths hang under that output row, so they sit next to the value they branch on (Ciarán, T26), and the
 *   panel keeps its three sections.
 * - Each path is one line on the rail: a dot, the value, then the step it leads to (a chip), or "Ends here". No "→"
 *   arrows and no connecting words: the rail and the order carry it (Aakarsh, T26: not a fan of the arrows).
 * - If is I1 (inbox `picks/if-panel`, decided 4 Nov): no output label and no dots. Each path is one line: its name,
 *   a muted "true" or "false" 12 px after it, then where it leads. The names share one column, so the targets line up.
 * - MOCK, the stretch case (Ciarán, Dei, T26): "Add path" adds a path on several fields, e.g. Approved AND Amount over
 *   10,000 → another reviewer. It lives in this panel only: the engine has one port per value, and the canvas card
 *   does not draw the extra port.
 */
import { Fragment, useState } from "react";

import { Button, Chip, type IconName, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { findStep, START_ID, stepLabel } from "./document";
import { useEditor } from "./editor-context";
import { pathsTake } from "./paths-flags";
import { PropertyRow, Section, SourceChip } from "./ui";

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
  backgroundColor: "neutral.fg.subtle",
});

const goesToStyle = css({ color: "neutral.fg.subtle" });

/** A two-field path: a dot column, then the condition and, under it, where it leads, both on one text edge. */
const extraStyle = css({
  display: "grid",
  gridTemplateColumns: "6px minmax(0, 1fr)",
  columnGap: "1.5",
  rowGap: "1",
  alignItems: "start",
  // The dot sits on the condition's first line, as on the paths above.
  "& > [aria-hidden]": { marginTop: "[9px]" },
});

const labelStackStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
});

/** I1: name, muted value, target; one column each. */
const ifPathsStyle = css({
  display: "grid",
  gridTemplateColumns: "[max-content max-content minmax(0, 1fr)]",
  alignItems: "center",
  columnGap: "3",
  rowGap: "2",
  textStyle: "sm",
  color: "neutral.fg.body",
  "& > [data-path-target]": {
    display: "flex",
    alignItems: "center",
    minWidth: "[0]",
    paddingLeft: "3",
  },
});

const pathValueStyle = css({ color: "neutral.fg.subtle" });

/** Where a port leads: a chip per step it is wired to, or "Ends here". */
const useGoesTo = (stepId: string, iconOf: (id: string) => IconName) => {
  const { document, setUi } = useEditor();

  const nameOf = (id: string) => {
    const step = findStep(document, id)?.step;
    return step ? stepLabel(step) : id === START_ID ? "Start" : id;
  };

  return (port: string) => {
    const targets = document.wires.filter(
      (wire) => wire.source === stepId && wire.sourcePort === port,
    );
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
};

/** `?paths=i2|cr`: the output the step branches on, listed as data with its values, as the other outputs are. */
const DecisionRow = ({
  actionDefinitionId,
  ports,
}: {
  actionDefinitionId: string;
  ports: { outputName: string; label: string }[];
}) => {
  const output = branchOutput[actionDefinitionId];
  if (!output) {
    return null;
  }
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
      hover={`${output.label} · ${ports.map((port) => port.label).join(" or ")}`}
    >
      <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
        {ports.map((port) => port.label).join(" · ")}
      </span>
    </PropertyRow>
  );
};

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
  const [extras, setExtras] = useState<ExtraPath[]>([]);
  const output = branchOutput[actionDefinitionId] ?? {
    label: "Paths",
    kind: ports.map((port) => port.label).join(" or "),
  };
  const goesTo = useGoesTo(stepId, iconOf);

  const approved = ports[0];

  // `?paths=i2|cr`: Decision is listed as data only; i2 puts its paths in their own section, cr on the canvas.
  if (actionDefinitionId !== "if" && pathsTake !== "b") {
    return (
      <DecisionRow actionDefinitionId={actionDefinitionId} ports={ports} />
    );
  }

  if (actionDefinitionId === "if") {
    return (
      <div className={ifPathsStyle} data-if-paths="i1">
        {ports.map((port) => (
          <Fragment key={port.outputName}>
            <span>{port.label}</span>
            <span className={pathValueStyle}>{port.outputName}</span>
            <span data-path-target>{goesTo(port.outputName)}</span>
          </Fragment>
        ))}
      </div>
    );
  }

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
          // MOCK: a path on two fields, drawn like the other paths: the dot, the value, then the AND chip of the
          // filter rows and the second field's condition; where it leads sits under it, in the same text column.
          <div key={extra.id} className={extraStyle}>
            <span className={dotStyle} aria-hidden="true" />
            <span className={pathStyle}>
              <span>{approved?.label ?? "Approved"}</span>
              <Chip size="md" suffix={{ iconName: "chevronDown" }}>
                AND
              </Chip>
              <span>Amount is over 10,000</span>
            </span>
            <span />
            <span className={pathStyle}>
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
              setExtras((current) => [
                ...current,
                { id: `extra${current.length}` },
              ])
            }
          >
            Add path
          </Button>
        ) : null}
      </div>
    </PropertyRow>
  );
};

/** One I2 path: its name and where it leads on one line, its condition under it. No nested edges inside. */
const pathCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  textStyle: "sm",
  color: "neutral.fg.body",
});

const pathHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  minHeight: "[24px]",
  minWidth: "[0]",
});

const whenStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  minWidth: "[0]",
});

const pathsListStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  "& > [data-path-card]": { alignSelf: "stretch" },
});

type AddedPath = { id: string; value: string | null };

/**
 * `?paths=i2` (Figma I2 `748:30752`, 1 Nov; 3 Nov call): Ask a person's paths in their own section under Outputs.
 * Each path matches one Decision value (enum only for v1) and leads to the step wired to its port; Otherwise is
 * last. MOCK: Add path adds a card whose value is picked from the Decision values; it draws no port.
 */
export const PathsSection = ({
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
  const goesTo = useGoesTo(stepId, iconOf);
  const [added, setAdded] = useState<AddedPath[]>([]);
  const output = branchOutput[actionDefinitionId];
  if (pathsTake !== "i2" || actionDefinitionId === "if" || !output) {
    return null;
  }
  const paths = ports.filter((port) => port.outputName !== "otherwise");
  return (
    <Section title="Paths">
      <div className={pathsListStyle}>
        {paths.map((port) => (
          <div key={port.outputName} className={pathCardStyle} data-path-card>
            <div className={pathHeadStyle}>
              <span>{port.label}</span>
              <span className={css({ display: "flex", minWidth: "[0]" })}>
                {goesTo(port.outputName)}
              </span>
            </div>
            <div className={whenStyle}>
              <span className={goesToStyle}>When</span>
              <span>{output.label}</span>
              <span className={goesToStyle}>is</span>
              <span>{port.label}</span>
            </div>
          </div>
        ))}
        {added.map((path, index) => (
          <div key={path.id} className={pathCardStyle} data-path-card>
            <div className={pathHeadStyle}>
              <span>
                {paths.find((port) => port.outputName === path.value)?.label ??
                  `Path ${paths.length + index + 1}`}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setAdded((current) =>
                    current.filter((candidate) => candidate.id !== path.id),
                  )
                }
              >
                Remove
              </Button>
            </div>
            <div className={whenStyle}>
              <span className={goesToStyle}>When</span>
              <span>{output.label}</span>
              <span className={goesToStyle}>is</span>
              <Select
                size="xs"
                placeholder="Choose a value"
                aria-label={`${output.label} value`}
                items={paths.map((port) => ({
                  value: port.outputName,
                  text: port.label,
                }))}
                value={path.value ?? undefined}
                onChange={(value) =>
                  setAdded((current) =>
                    current.map((candidate) =>
                      candidate.id === path.id
                        ? { ...candidate, value }
                        : candidate,
                    ),
                  )
                }
              />
            </div>
          </div>
        ))}
        <div className={pathCardStyle} data-path-card>
          <div className={pathHeadStyle}>
            <span className={goesToStyle}>Otherwise</span>
            <span className={css({ display: "flex", minWidth: "[0]" })}>
              {goesTo("otherwise")}
            </span>
          </div>
        </div>
        <Button
          size="xs"
          variant="subtle"
          iconName="plus"
          onClick={() =>
            setAdded((current) => [
              ...current,
              { id: `added${current.length}`, value: null },
            ])
          }
        >
          Add path
        </Button>
      </div>
    </Section>
  );
};
