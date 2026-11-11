/**
 * MOCK, `?switch=s1|s2|s3|s4` (inbox `switch-panel`, 5 Nov): the panel of the `node-paths` demo's Switch, "Route by
 * supplier region", one take per inbox option. The engine has no Switch yet; cases, values and conditions live in
 * this panel's state, and only a path's name, its wire and Default's on/off reach the document (and so the card).
 * See `switch-flags.ts` for the takes.
 */
import { useState } from "react";

import {
  Button,
  Chip,
  Filter,
  type FilterOperator,
  Icon,
  type IconName,
  Menu,
  Toggle,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  EmptyJoiner,
  filterFitStyle,
  Joiner,
  MatchLine,
  labelColumnStyle,
  menuSegmentStyle,
  rowStackStyle,
  rowStyle,
  takeColumnStyle,
  takeFooterAtEdge,
} from "./condition-builder";
import {
  type DraftActionStep,
  flattenSteps,
  stepLabel,
  updateStep,
} from "./document";
import { Select } from "./fill-select";
import { useEditor } from "./editor-context";
import {
  conditionLayout,
  ifRenameTake,
  joinerTake,
  namedPorts,
  regionValues,
  switchTake,
} from "./switch-flags";
import { ToggleableTextInput } from "./ds-parts/toggleable-text-input";
import { keyStyle, PropertyRow, Section } from "./ui";

type Port = { outputName: string; label: string };

const helpStyle = css({
  gridColumn: "1 / -1",
  textStyle: "sm",
  color: "neutral.fg.muted",
});

/** A path's row on the panel grid: its name in the label column, where it leads in the value column. */
const nameStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  minWidth: "[0]",
  minHeight: "[32px]",
  textStyle: "sm",
  color: "neutral.s120",
  "& > [data-sub]": { color: "neutral.fg.muted", lineHeight: "[16px]" },
});

/** In-place names sit where plain text would: the field's 8 px inset is pulled back out. */
const renameStyle = css({
  "&[class]": {
    marginLeft: "[-8px]",
    fontWeight: "normal",
    color: "neutral.s120",
    maxWidth: "[calc(100% + 8px)]",
  },
  "&[data-rename-input]": { minWidth: "[96px]" },
});

const headingRenameStyle = css({
  "&[class]": { fontWeight: "medium", color: "neutral.fg.heading" },
});

/** The target: a 32 px Select across the value column, as on the If panel (I1). */
const targetStyle = css({
  display: "flex",
  minWidth: "[0]",
  "& > *": { flex: "1", minWidth: "[0]" },
  "& button, & [data-part='trigger']": { height: "[32px]" },
});

/** A stacked case (S2, S3): its rows, then a hairline before the next. Delete shows on hover. */
const caseStyle = css({
  position: "relative",
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "minmax(88px, 30%) minmax(0, 1fr)",
  columnGap: "2",
  rowGap: "2",
  alignItems: "center",
  paddingBottom: "3",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  "& > [data-case-delete]": {
    position: "absolute",
    top: "[2px]",
    right: "[0]",
    visibility: "hidden",
  },
  "&:hover > [data-case-delete], &:focus-within > [data-case-delete]": {
    visibility: "visible",
  },
});

const caseHeadStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  minHeight: "[28px]",
  paddingRight: "[32px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const chipsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1",
  minHeight: "[32px]",
});

/** S3: a case's conditions on the panel grid: the joiner in the label column, the chip in the value column. */
const conditionsStyle = css({ display: "contents" });

const conditionRowStyle = css({
  display: "contents",
  "& > [data-joiner]": {
    display: "flex",
    alignItems: "center",
    minHeight: "[28px]",
    textStyle: "sm",
    color: "neutral.fg.muted",
  },
  "& > [data-chip]": { display: "flex", minWidth: "[0]" },
});

const filterStyle = css({
  "&[class]": { textStyle: "sm", "--filter-font-size": "[1em]" },
});

/** The not-exhaustive note: faint text with the warning glyph in the DS warning tone's light step. */
const warningStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "flex-start",
  gap: "1.5",
  textStyle: "sm",
  color: "neutral.fg.muted",
  "& > svg": {
    flexShrink: 0,
    marginTop: "[2px]",
    color: "yellow.s90",
  },
});

const defaultHeadStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  minHeight: "[28px]",
});

const splitByStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  gap: "1",
  textStyle: "sm",
  color: "neutral.fg.muted",
  "& button": { color: "neutral.fg.heading" },
});

const useRenamePath = (stepId: string) => {
  const { setDocument } = useEditor();
  return (outputName: string, name: string) =>
    setDocument((document) =>
      updateStep(document, stepId, (step) =>
        step.kind === "action"
          ? {
              ...step,
              pathNames: { ...step.pathNames, [outputName]: name },
            }
          : step,
      ),
    );
};

/** Where a path leads: a Select of the flow's steps; an open path shows "Select next step". */
const PathTarget = ({
  stepId,
  port,
  iconOf,
}: {
  stepId: string;
  port: Port;
  iconOf: (id: string) => IconName;
}) => {
  const { document, setDocument } = useEditor();
  const wire = document.wires.find(
    (candidate) =>
      candidate.source === stepId && candidate.sourcePort === port.outputName,
  );
  const items = flattenSteps(document.steps)
    .filter(({ step }) => step.stepId !== stepId)
    .map(({ step }) => ({ value: step.stepId, text: stepLabel(step) }));
  return (
    <span className={targetStyle} data-path-target>
      <Select
        size="sm"
        width="fullWidth"
        aria-label={`${port.label} leads to`}
        placeholder="Select next step"
        prefix={wire ? { iconName: iconOf(wire.target) } : undefined}
        items={items}
        value={wire?.target}
        onChange={(target) => {
          if (!target) {
            return;
          }
          setDocument((current) => ({
            ...current,
            wires: [
              ...current.wires.filter(
                (candidate) =>
                  !(
                    candidate.source === stepId &&
                    candidate.sourcePort === port.outputName
                  ),
              ),
              {
                id: `${stepId}:${port.outputName}->${target}`,
                source: stepId,
                sourcePort: port.outputName,
                target,
              },
            ],
          }));
        }}
      />
    </span>
  );
};

/** A case's name: renamed in place on hover (Attio), no pen. Default only with `?ifrename=b`. */
const PathName = ({
  stepId,
  port,
  renamable,
  heading = false,
}: {
  stepId: string;
  port: Port;
  renamable: boolean;
  /** A stacked case's title: medium, as the panel's titles. */
  heading?: boolean;
}) => {
  const rename = useRenamePath(stepId);
  return renamable ? (
    <ToggleableTextInput
      value={port.label}
      label={`${port.label} path name`}
      className={cx(renameStyle, heading && headingRenameStyle)}
      onSave={(next) => rename(port.outputName, next)}
    />
  ) : (
    <span>{port.label}</span>
  );
};

const defaultRenamable = ifRenameTake === "b";

const PathRow = ({
  stepId,
  port,
  sub,
  iconOf,
  renamable = false,
}: {
  stepId: string;
  port: Port;
  sub?: string;
  iconOf: (id: string) => IconName;
  renamable?: boolean;
}) => (
  <div className={css({ display: "contents" })} data-row>
    <span className={nameStyle}>
      <PathName stepId={stepId} port={port} renamable={renamable} />
      {sub ? <span data-sub>{sub}</span> : null}
    </span>
    <PathTarget stepId={stepId} port={port} iconOf={iconOf} />
  </div>
);

/** "Switch on": the field the cases read (S1, S2). */
const SwitchOn = () => (
  <Section title="Switch on">
    <PropertyRow label="Value">
      <span className={targetStyle}>
        <Select
          size="sm"
          width="fullWidth"
          aria-label="Value"
          items={[
            { value: "region", text: "Region" },
            { value: "priority", text: "Priority" },
          ]}
          value="region"
          onChange={() => {}}
        />
      </span>
    </PropertyRow>
    <span className={helpStyle}>From Failed batch · Supplier</span>
  </Section>
);

/** S1: one case per Region option, named after it, then Default. */
const OptionCases = ({
  stepId,
  ports,
  iconOf,
}: {
  stepId: string;
  ports: Port[];
  iconOf: (id: string) => IconName;
}) => (
  <>
    <SwitchOn />
    <Section title="Cases">
      <span className={helpStyle}>One case for each Region option</span>
      {ports.map((port) => (
        <PathRow
          key={port.outputName}
          stepId={stepId}
          port={port}
          iconOf={iconOf}
          sub={port.outputName === "default" ? "no region set" : undefined}
          renamable={port.outputName === "default" && defaultRenamable}
        />
      ))}
    </Section>
  </>
);

const DeleteCase = ({ name }: { name: string }) => (
  <span data-case-delete>
    <Button
      size="xs"
      variant="ghost"
      iconName="trash"
      aria-label={`Delete ${name}`}
      tooltip="Delete case"
    />
  </span>
);

const initialMatches: Record<string, string[]> = {
  europe: ["Europe"],
  americas: ["Americas"],
  asia: ["Asia", "Oceania"],
  africa: ["Africa"],
};

/** S2: cases set in the block; each matches one or more Region values, as chips. */
const ValueCases = ({
  stepId,
  ports,
  iconOf,
}: {
  stepId: string;
  ports: Port[];
  iconOf: (id: string) => IconName;
}) => {
  const [matches, setMatches] = useState(initialMatches);
  const cases = ports.filter((port) => port.outputName !== "default");
  const fallback = ports.find((port) => port.outputName === "default");
  return (
    <>
      <SwitchOn />
      <Section title="Cases">
        {cases.map((port) => {
          const values = matches[port.outputName] ?? [];
          const unused = regionValues.filter(
            (value) => !values.includes(value),
          );
          return (
            <div key={port.outputName} className={caseStyle} data-case>
              <span className={caseHeadStyle}>
                <PathName stepId={stepId} port={port} renamable heading />
              </span>
              <DeleteCase name={port.label} />
              <span className={keyStyle}>Matches</span>
              <span className={chipsStyle}>
                {values.map((value) => (
                  <Chip
                    key={value}
                    size="lg"
                    removeable={{
                      onRemove: () =>
                        setMatches((current) => ({
                          ...current,
                          [port.outputName]: values.filter(
                            (candidate) => candidate !== value,
                          ),
                        })),
                    }}
                  >
                    {value}
                  </Chip>
                ))}
                {unused.length > 0 ? (
                  <Menu
                    items={unused.map((value) => ({
                      id: value,
                      text: value,
                      onClick: () =>
                        setMatches((current) => ({
                          ...current,
                          [port.outputName]: [...values, value],
                        })),
                    }))}
                    trigger={
                      <Button
                        size="xs"
                        variant="ghost"
                        iconName="plus"
                        aria-label={`Add a value to ${port.label}`}
                      />
                    }
                  />
                ) : null}
              </span>
              <span className={keyStyle}>Goes to</span>
              <PathTarget stepId={stepId} port={port} iconOf={iconOf} />
            </div>
          );
        })}
        <div>
          <Button size="sm" variant="subtle" iconName="plus">
            Add case
          </Button>
        </div>
        {fallback ? (
          <div
            className={cx(caseStyle, css({ borderBottomWidth: "[0]" }))}
            data-case
          >
            <span className={caseHeadStyle}>
              <PathName
                stepId={stepId}
                port={fallback}
                renamable={defaultRenamable}
                heading
              />
            </span>
            <span className={keyStyle}>Goes to</span>
            <PathTarget stepId={stepId} port={fallback} iconOf={iconOf} />
          </div>
        ) : null}
      </Section>
    </>
  );
};

type Condition = { field: "Region" | "Priority"; value: string };
type CaseConditions = { join: "and" | "or"; rows: Condition[] };

const initialConditions: Record<string, CaseConditions> = {
  europe: { join: "or", rows: [{ field: "Region", value: "Europe" }] },
  americas: { join: "or", rows: [{ field: "Region", value: "Americas" }] },
  asia: {
    join: "or",
    rows: [
      { field: "Region", value: "Asia" },
      { field: "Priority", value: "High" },
    ],
  },
  africa: { join: "or", rows: [{ field: "Region", value: "Africa" }] },
};

const fieldValues: Record<Condition["field"], string[]> = {
  Region: regionValues,
  Priority: ["High", "Medium", "Low"],
};

/**
 * The Region values no case is sure to match: a case covers a value when one of its OR rows is "Region is" that
 * value. An AND case covers nothing for sure.
 */
const uncovered = (conditions: Record<string, CaseConditions>) => {
  const covered = new Set(
    Object.values(conditions).flatMap((group) =>
      group.join === "or" || group.rows.length === 1
        ? group.rows
            .filter((row) => row.field === "Region")
            .map((row) => row.value)
        : [],
    ),
  );
  return regionValues.filter((value) => !covered.has(value));
};

const ConditionChip = ({
  row,
  onChange,
  className = filterStyle,
}: {
  row: Condition;
  onChange: (value: string) => void;
  className?: string;
}) => {
  const operators: FilterOperator<{ is: string }>[] = [
    {
      key: "is",
      label: "is",
      input: {
        type: "select",
        items: fieldValues[row.field].map((value) => ({ value, text: value })),
      },
    },
  ];
  return (
    <Filter<{ is: string }>
      size="sm"
      className={className}
      property={row.field}
      propertyLabel={row.field}
      operators={operators}
      value={{ key: "is", value: row.value }}
      onChange={(_key, value) => {
        if (value) {
          onChange(value);
        }
      }}
    />
  );
};

/**
 * S3 (Attio; Ciarán, Slack 5 Nov 11:20): each case is a condition set with an in-place name, checked top to bottom,
 * then an optional Default. With Default off, the run stops at the Switch when no case matches; the panel warns when
 * a Region value has no case.
 */
const ConditionCases = ({
  step,
  ports,
  iconOf,
}: {
  step: DraftActionStep;
  ports: Port[];
  iconOf: (id: string) => IconName;
}) => {
  const { setDocument } = useEditor();
  const [conditions, setConditions] = useState(initialConditions);
  const cases = ports.filter((port) => port.outputName !== "default");
  const fallback = ports.find((port) => port.outputName === "default");
  const defaultOn = !step.noDefault;
  const missing = uncovered(conditions);
  const setDefault = (on: boolean) =>
    setDocument((document) => ({
      ...updateStep(document, step.stepId, (current) =>
        current.kind === "action" ? { ...current, noDefault: !on } : current,
      ),
      // Off removes Default's port, so its wire goes with it.
      wires: on
        ? document.wires
        : document.wires.filter(
            (wire) =>
              !(wire.source === step.stepId && wire.sourcePort === "default"),
          ),
    }));
  return (
    <Section title="Cases">
      <span className={helpStyle}>
        Checked top to bottom. The first match runs.
      </span>
      {cases.map((port, index) => {
        const group = conditions[port.outputName] ?? { join: "or", rows: [] };
        return (
          <div key={port.outputName} className={caseStyle} data-case>
            <span className={caseHeadStyle}>
              <PathName stepId={step.stepId} port={port} renamable heading />
            </span>
            <DeleteCase name={port.label || `Case ${index + 1}`} />
            <div className={conditionsStyle}>
              {group.rows.map((row, rowIndex) => (
                <div
                  // oxlint-disable-next-line react/no-array-index-key -- rows have no id in this mock
                  key={rowIndex}
                  className={conditionRowStyle}
                >
                  <span data-joiner>
                    {rowIndex === 0 ? (
                      "Where"
                    ) : (
                      <Button
                        size="sm"
                        variant="subtle"
                        iconName="chevronDown"
                        iconPosition="right"
                        onClick={() =>
                          setConditions((current) => ({
                            ...current,
                            [port.outputName]: {
                              ...group,
                              join: group.join === "or" ? "and" : "or",
                            },
                          }))
                        }
                      >
                        {group.join.toUpperCase()}
                      </Button>
                    )}
                  </span>
                  <span data-chip>
                    <ConditionChip
                      row={row}
                      onChange={(value) =>
                        setConditions((current) => ({
                          ...current,
                          [port.outputName]: {
                            ...group,
                            rows: group.rows.map((candidate, candidateIndex) =>
                              candidateIndex === rowIndex
                                ? { ...candidate, value }
                                : candidate,
                            ),
                          },
                        }))
                      }
                    />
                  </span>
                </div>
              ))}
              <span />
              <span className={css({ display: "flex" })}>
                <Button
                  size="sm"
                  variant="ghost"
                  iconName="plus"
                  onClick={() =>
                    setConditions((current) => ({
                      ...current,
                      [port.outputName]: {
                        ...group,
                        rows: [
                          ...group.rows,
                          { field: "Region", value: "Europe" },
                        ],
                      },
                    }))
                  }
                >
                  Add condition
                </Button>
              </span>
            </div>
            <span className={keyStyle}>Goes to</span>
            <PathTarget stepId={step.stepId} port={port} iconOf={iconOf} />
          </div>
        );
      })}
      <div>
        <Button size="sm" variant="subtle" iconName="plus">
          Add case
        </Button>
      </div>
      <div className={cx(caseStyle, css({ borderBottomWidth: "[0]" }))}>
        <span className={defaultHeadStyle}>
          <span className={caseHeadStyle}>
            {fallback ? (
              <PathName
                stepId={step.stepId}
                port={fallback}
                renamable={defaultRenamable}
                heading
              />
            ) : (
              "Default"
            )}
          </span>
          <Toggle
            size="sm"
            value={defaultOn}
            onChange={setDefault}
            aria-label="Default"
          />
        </span>
        <span className={helpStyle}>Runs when no case matches</span>
        {defaultOn && fallback ? (
          <>
            <span className={keyStyle}>Goes to</span>
            <PathTarget stepId={step.stepId} port={fallback} iconOf={iconOf} />
          </>
        ) : null}
        {!defaultOn && missing.length > 0 ? (
          <span className={warningStyle} data-not-exhaustive>
            <Icon name="warning" size="sm" />
            <span>
              {`Cases aren't exhaustive: no case covers ${missing.join(", ")}, so those runs stop here.`}
            </span>
          </span>
        ) : null}
      </div>
    </Section>
  );
};

/**
 * `?switchlayout=a|b|c` (inbox `condition-panels-layout`): S3 on the condition builder's own rows, so If, Switch and
 * Find entities share one layout. A case is its in-place name (regular, as I1's path names), its condition rows
 * (joiner, chip, ⋮ on hover), the Add button and "Goes to"; 16 px on each side of the hairline between cases.
 */
const layoutCaseStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingBlock: "4",
  "& + &": {
    borderTopWidth: "[1px]",
    borderTopStyle: "solid",
    borderTopColor: "neutral.bd.subtle",
  },
  "&:first-child": { paddingTop: "[0]" },
  "& > [data-case-delete]": {
    position: "absolute",
    top: "[3px]",
    right: "[0]",
    visibility: "hidden",
  },
  "& + & > [data-case-delete]": { top: "[19px]" },
  "&:hover > [data-case-delete], &:focus-within > [data-case-delete]": {
    visibility: "visible",
  },
});

const layoutNameStyle = css({
  display: "flex",
  alignItems: "center",
  minHeight: "[28px]",
  paddingRight: "[32px]",
  textStyle: "sm",
  color: "neutral.s120",
});

/** The case's conditions: the builder's rows, then its Add button 16 px under them. */
const layoutConditionsStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "4",
  alignSelf: "stretch",
});

const layoutRowsStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  alignSelf: "stretch",
});

const layoutAddStyle = css({
  paddingLeft: "[calc(var(--flows-label-column) + 8px)]",
});

/** "Goes to" on the panel's grid: the label column, then the target. 16 px under the Add button. */
const layoutTargetRowStyle = css({
  display: "grid",
  gridTemplateColumns: "minmax(88px, 30%) minmax(0, 1fr)",
  columnGap: "2",
  alignItems: "center",
  marginTop: "2",
});

const layoutDefaultStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingTop: "4",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
});

const layoutDefaultHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  minHeight: "[28px]",
  textStyle: "sm",
  color: "neutral.s120",
});

const LayoutConditionCases = ({
  step,
  ports,
  iconOf,
}: {
  step: DraftActionStep;
  ports: Port[];
  iconOf: (id: string) => IconName;
}) => {
  const { setDocument } = useEditor();
  const [conditions, setConditions] = useState(initialConditions);
  const cases = ports.filter((port) => port.outputName !== "default");
  const fallback = ports.find((port) => port.outputName === "default");
  const defaultOn = !step.noDefault;
  const missing = uncovered(conditions);
  const setDefault = (on: boolean) =>
    setDocument((document) => ({
      ...updateStep(document, step.stepId, (current) =>
        current.kind === "action" ? { ...current, noDefault: !on } : current,
      ),
      wires: on
        ? document.wires
        : document.wires.filter(
            (wire) =>
              !(wire.source === step.stepId && wire.sourcePort === "default"),
          ),
    }));
  const setGroup = (outputName: string, group: CaseConditions) =>
    setConditions((current) => ({ ...current, [outputName]: group }));
  return (
    <Section title="Cases">
      <span className={helpStyle}>
        Checked top to bottom. The first match runs.
      </span>
      <div
        className={css({
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          marginTop: "2",
        })}
      >
        {cases.map((port, index) => {
          const group = conditions[port.outputName] ?? {
            join: "or",
            rows: [],
          };
          return (
            <div key={port.outputName} className={layoutCaseStyle} data-case>
              <span className={layoutNameStyle}>
                <PathName stepId={step.stepId} port={port} renamable />
              </span>
              <DeleteCase name={port.label || `Case ${index + 1}`} />
              <div
                className={cx(
                  layoutConditionsStyle,
                  labelColumnStyle,
                  conditionLayout === "c" && takeColumnStyle,
                )}
              >
                <div className={layoutRowsStyle}>
                  {joinerTake === "j3" && group.rows.length > 1 ? (
                    <MatchLine
                      conjunction={group.join}
                      onPick={(join) =>
                        setGroup(port.outputName, { ...group, join })
                      }
                    />
                  ) : null}
                  {group.rows.map((row, rowIndex) => (
                    <div
                      // oxlint-disable-next-line react/no-array-index-key -- rows have no id in this mock
                      key={rowIndex}
                      className={rowStackStyle}
                    >
                      {joinerTake === "j3" && group.rows.length > 1 ? (
                        <EmptyJoiner />
                      ) : (
                      <Joiner
                        conjunction={rowIndex === 0 ? undefined : group.join}
                        onPick={
                          rowIndex === 0
                            ? undefined
                            : (join) =>
                                setGroup(port.outputName, { ...group, join })
                        }
                      />
                      )}
                      <div className={rowStyle} data-condition-row={rowIndex}>
                        <ConditionChip
                          row={row}
                          className={filterFitStyle}
                          onChange={(value) =>
                            setGroup(port.outputName, {
                              ...group,
                              rows: group.rows.map((candidate, candidateIndex) =>
                                candidateIndex === rowIndex
                                  ? { ...candidate, value }
                                  : candidate,
                              ),
                            })
                          }
                        />
                        <Menu
                          position="bottom-end"
                          items={[
                            {
                              id: "delete",
                              text: "Delete condition",
                              onClick: () =>
                                setGroup(port.outputName, {
                                  ...group,
                                  rows: group.rows.filter(
                                    (_row, candidateIndex) =>
                                      candidateIndex !== rowIndex,
                                  ),
                                }),
                            },
                          ]}
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className={menuSegmentStyle}
                              iconName="ellipsisVertical"
                              aria-label="Condition options"
                            />
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className={takeFooterAtEdge ? undefined : layoutAddStyle}>
                  <Button
                    size="sm"
                    variant="subtle"
                    iconName="plus"
                    onClick={() =>
                      setGroup(port.outputName, {
                        ...group,
                        rows: [
                          ...group.rows,
                          { field: "Region", value: "Europe" },
                        ],
                      })
                    }
                  >
                    Add condition
                  </Button>
                </div>
              </div>
              <div className={layoutTargetRowStyle}>
                <span className={keyStyle}>Goes to</span>
                <PathTarget stepId={step.stepId} port={port} iconOf={iconOf} />
              </div>
            </div>
          );
        })}
        <div className={css({ paddingBottom: "4" })}>
          <Button size="sm" variant="subtle" iconName="plus">
            Add case
          </Button>
        </div>
        <div className={layoutDefaultStyle}>
          <span className={layoutDefaultHeadStyle}>
            {fallback ? (
              <PathName
                stepId={step.stepId}
                port={fallback}
                renamable={defaultRenamable}
              />
            ) : (
              "Default"
            )}
            <Toggle
              size="sm"
              value={defaultOn}
              onChange={setDefault}
              aria-label="Default"
            />
          </span>
          <span className={helpStyle}>Runs when no case matches</span>
          {defaultOn && fallback ? (
            <div className={layoutTargetRowStyle}>
              <span className={keyStyle}>Goes to</span>
              <PathTarget
                stepId={step.stepId}
                port={fallback}
                iconOf={iconOf}
              />
            </div>
          ) : null}
          {!defaultOn && missing.length > 0 ? (
            <span className={warningStyle} data-not-exhaustive>
              <Icon name="warning" size="sm" />
              <span>
                {`Cases aren't exhaustive: no case covers ${missing.join(", ")}, so those runs stop here.`}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </Section>
  );
};

/** S4: no Switch step. Find entities finds the batch's supplier, and its Paths split by Region. */
const SplitByPaths = ({
  stepId,
  ports,
  iconOf,
}: {
  stepId: string;
  ports: Port[];
  iconOf: (id: string) => IconName;
}) => (
  <>
    <Section title="Find">
      <PropertyRow label="Type">
        <span className={css({ textStyle: "sm", color: "neutral.s120" })}>
          Supplier
        </span>
      </PropertyRow>
      <PropertyRow label="Where">
        <span className={css({ textStyle: "sm", color: "neutral.s120" })}>
          Supplies Failed batch
        </span>
      </PropertyRow>
    </Section>
    <Section title="Paths">
      <span className={splitByStyle}>
        Split by
        <Menu
          items={[
            {
              id: "region",
              text: "Region",
              selected: true,
              selectedStyle: "highlight" as const,
              onClick: () => {},
            },
            { id: "priority", text: "Priority", onClick: () => {} },
          ]}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              iconName="chevronDown"
              iconPosition="right"
            >
              Region
            </Button>
          }
        />
      </span>
      {ports.map((port) => (
        <PathRow
          key={port.outputName}
          stepId={stepId}
          port={port}
          iconOf={iconOf}
          sub={port.outputName === "default" ? "no region set" : undefined}
          renamable={port.outputName === "default" && defaultRenamable}
        />
      ))}
    </Section>
  </>
);

/** The take's sections for the demo Switch, under the panel header. */
export const SwitchSections = ({
  step,
  ports,
  iconOf,
}: {
  step: DraftActionStep;
  ports: Port[];
  iconOf: (id: string) => IconName;
}) => {
  const named = namedPorts(step, ports);
  switch (switchTake) {
    case "s1":
      return <OptionCases stepId={step.stepId} ports={named} iconOf={iconOf} />;
    case "s2":
      return <ValueCases stepId={step.stepId} ports={named} iconOf={iconOf} />;
    case "s3":
      // Default's row stays when it is off, so pass every port and let the row read `noDefault`.
      return conditionLayout ? (
        <LayoutConditionCases
          step={step}
          ports={namedPorts({ pathNames: step.pathNames }, ports)}
          iconOf={iconOf}
        />
      ) : (
        <ConditionCases
          step={step}
          ports={namedPorts({ pathNames: step.pathNames }, ports)}
          iconOf={iconOf}
        />
      );
    case "s4":
      return (
        <SplitByPaths stepId={step.stepId} ports={named} iconOf={iconOf} />
      );
    default:
      return null;
  }
};
