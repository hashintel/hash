import { createContext, use, useState } from "react";

import {
  Button,
  Form,
  Menu,
  NumberInput,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import {
  applyPattern,
  checkOpLabel,
  checkOps,
  checkOpSymbol,
  constraintCode,
  constraintCodeText,
  contradictionIn,
  emptyCheck,
  firstCheck,
  forEveryHint,
  hasSecondSlot,
  isEventSubject,
  isNestedRule,
  mapConstraintChecks,
  MAX_ROW_DEPTH,
  negateCheck,
  newNestedRule,
  parseSubjectValue,
  ruleDepth,
  rulePatternOf,
  rulePatterns,
  secondChecks,
  subjectGroups,
  subjectUnit,
  subjectValue,
  takesWindow,
  timeWordHint,
  timeWordLabel,
} from "../../react/controller-prototype/constraints";
import { useConstraints } from "../../react/controller-prototype/use-constraints";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import { DraftFieldInput } from "../components/draft-field-input";
import { VerticalSubViewsContainer } from "../components/sub-view/vertical/vertical-sub-views-container";
import { useDraftField } from "../hooks/use-draft-field";
import { UI_MESSAGES } from "../constants/ui-messages";
import { ConstraintIcon } from "./constraint-tree";
import { SubjectPicker } from "./subject-picker";

import type {
  Check,
  CheckOp,
  CheckSubject,
  ConstraintWindow,
  ModelConstraint,
  NestedRule,
  RuleItem,
  TimeWord,
} from "../../react/controller-prototype/constraints";
import type { MenuItem, Position } from "@hashintel/ds-components";
import type { SubView } from "../components/sub-view/types";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  paddingY: "3",
});

const headingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  marginBottom: "2",
});

const mutedTextStyle = css({ fontSize: "sm", color: "neutral.s100" });

const disabledTextStyle = css({ color: "neutral.s80" });

const mutedText = (disabled: boolean) =>
  cx(mutedTextStyle, disabled && disabledTextStyle);

// The select's own chevron, for the time-word button beside the selects.
const chevronStyle = css({
  display: "block",
  alignSelf: "center",
  width: "[0.5em]",
  height: "[0.5em]",
  borderRight: "[1.5px solid currentColor]",
  borderBottom: "[1.5px solid currentColor]",
  color: "neutral.s100",
  transform: "[rotate(45deg) translateY(-15%)]",
  flex: "[0 0 auto]",
});

const ruleCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  paddingBottom: "1",
  border: "1px solid",
  borderColor: "neutral.a30",
  borderRadius: "lg",
});

const ruleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});

// Controls keep their width; the bound wraps to the next line instead.
const tightRowStyle = css({ gap: "1.5", "& > *": { flexShrink: "0" } });

// Keeps a comparison, its bound and unit together on one line.
const noWrapStyle = css({ flexWrap: "nowrap" });

const numberStyle = css({ width: "[56px]" });

// Lines may break only after ", ", ": ", "→ ", "∧ " and "∨ "; other spaces become non-breaking.
const breakableCode = (code: string) =>
  code
    .split(/(, |: |→ |∧ |∨ )/)
    .map((part, index) => (index % 2 ? part : part.replace(/ /g, String.fromCodePoint(0xa0))))
    .join("");

const codeLineStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s120",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "1.5",
  overflowWrap: "anywhere",
  paddingLeft: "[calc(8px + 2ch)]",
  textIndent: "[-2ch]",
});

const addButtonsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1",
  marginLeft: "-1",
});

const codeActionsStyle = css({ display: "flex", justifyContent: "flex-end" });

// The tooltip trigger zeroes its line height for icons, so text needs its own.
const tooltipFillStyle = css({
  display: "block",
  width: "[100%]",
  lineHeight: "[20px]",
});

type UpdateConstraint = (
  update: (current: ModelConstraint) => ModelConstraint,
) => void;

const hintTextStyle = css({ display: "block", maxWidth: "[250px]",
  fontWeight: "normal" });

// Moves the tooltip anchor 12px past the menu edge, so it clears the menu.
const tooltipReachStyle = css({
  width: "[calc(100% + 12px)]",
  marginRight: "[-12px]",
});

// Narrow enough to open to the right of the mode menu inside a 1440px window.
const narrowHintStyle = css({ maxWidth: "[215px]" });

const withTextHint = (
  label: string,
  hint: string,
  position: Position,
  narrow = false,
): React.ReactNode => (
  <Tooltip
    content={
      <span className={cx(hintTextStyle, narrow && narrowHintStyle)}>
        {hint}
      </span>
    }
    position={position}
  >
    <span className={cx(tooltipFillStyle, narrow && tooltipReachStyle)}>
      {label}
    </span>
  </Tooltip>
);

const withHint = (word: TimeWord, position: Position): React.ReactNode =>
  withTextHint(timeWordLabel[word], timeWordHint[word], position);

// Wider and roomier than the DS default, with the tooltip trigger and the
// "More" chevron spanning the row.
const timeMenuStyle = css({
  minWidth: "[200px]",
  "--selectable-list-item-padding-y": "[5px]",
  "& [data-part=item] > span:last-child, & [data-part=trigger-item] > span:first-child":
    { flex: "1" },
  "& [data-scope=tooltip][data-part=trigger]": { width: "[100%]" },
  // One 1px divider between the groups, with equal space either side: the
  // first group draws it, so the second adds no border or margin of its own.
  "& [data-part=item-group]:first-child": { marginBottom: "0" },
  "& [data-part=item-group]:last-child": {
    borderTopWidth: "0",
    marginTop: "0",
  },
  // The tick: 14px, in the text colour.
  "& [role=menuitem] > span[aria-hidden=true] svg": {
    width: "[14px]",
    height: "[14px]",
    color: "[inherit]",
  },
  // Aligns "More" with the words, which sit after a tick.
  "& [data-part=trigger-item]": {
    paddingLeft: "[calc(var(--selectable-list-item-padding-x) + 20px)]",
  },
});

const timeButtonStyle = css({
  "&&": {
    fontWeight: "normal",
    borderColor: "neutral.s40",
    _hover: { borderColor: "neutral.s80" },
  },
});

const TimeWordMenu: React.FC<{
  time: TimeWord;
  disabled: boolean;
  /** A nested rule offers always, never and eventually only. */
  basic?: boolean;
  onChange: (word: TimeWord) => void;
}> = ({ time, disabled, basic, onChange }) => {
  const wordItem = (word: TimeWord, position: Position): MenuItem => ({
    id: word,
    text: withHint(word, position),
    selectedStyle: "tick",
    selected: time === word,
    onClick: () => onChange(word),
  });

  return (
    <Menu
      className={timeMenuStyle}
      items={[
        {
          id: "words",
          label: "",
          items: [
            wordItem("always", "right-start"),
            wordItem("never", "right-start"),
            wordItem("eventually", "right-start"),
            ...(basic ? [] : [wordItem("atEnd", "right-start")]),
          ],
        },
        ...(basic
          ? []
          : [
              {
                id: "two-sided",
                label: "",
                items: [
                  wordItem("until", "right-start"),
                  wordItem("weakUntil", "right-start"),
                ],
              },
            ]),
      ]}
      trigger={
        <Button
          size="sm"
          variant="subtle"
          className={timeButtonStyle}
          suffix={<span className={chevronStyle} />}
          aria-label="Time word"
          disabled={disabled}
        >
          {timeWordLabel[time]}
        </Button>
      }
    />
  );
};

const forEveryLabelStyle = css({
  fontSize: "sm",
  color: "neutral.s100",
  textDecoration: "underline dotted",
  textUnderlineOffset: "[3px]",
  cursor: "help",
});

const swatchStyle = css({
  display: "inline-block",
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[2px]",
  marginRight: "1.5",
  flexShrink: "0",
});

const whereItems: { value: "in" | "reaches"; text: string }[] = [
  { value: "in", text: "in" },
  { value: "reaches", text: "that reaches" },
];

const ForEveryRows: React.FC<{
  forEvery: NonNullable<ModelConstraint["forEvery"]>;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ forEvery, disabled, update }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const types = petriNetDefinition.types;
  const type = types.find(({ id }) => id === forEvery.typeId);
  const setForEvery = (patch: Partial<typeof forEvery>) =>
    update((current) =>
      current.forEvery
        ? { ...current, forEvery: { ...current.forEvery, ...patch } }
        : current,
    );

  return (
    <>
      <div className={ruleRowStyle}>
        <Tooltip
          content={
            <span className={hintTextStyle}>{forEveryHint(type?.name ?? "")}</span>
          }
          position="left-start"
        >
          <span
            className={cx(forEveryLabelStyle, disabled && disabledTextStyle)}
          >
            For every
          </span>
        </Tooltip>
        <Select
          size="sm"
          width="fitContent"
          aria-label="Token type"
          disabled={disabled}
          required
          value={forEvery.typeId}
          items={types.map((candidate) => ({
            value: candidate.id,
            text: candidate.name,
          }))}
          renderItem={(value) => {
            const candidate = types.find(({ id }) => id === value);
            return (
              <span>
                <span
                  className={swatchStyle}
                  style={{ backgroundColor: candidate?.displayColor }}
                />
                {candidate?.name ?? value}
              </span>
            );
          }}
          onChange={(typeId) =>
            update((current) => ({
              ...mapConstraintChecks(current, (check) => ({
                ...check,
                subject: null,
              })),
              forEvery: current.forEvery && { ...current.forEvery, typeId },
            }))
          }
        />
        <Select
          size="sm"
          width="fitContent"
          aria-label="Where to watch"
          disabled={disabled}
          required
          value={forEvery.where}
          items={whereItems}
          onChange={(where) => {
            if (where === "in" || where === "reaches") {
              setForEvery({ where });
            }
          }}
        />
        {disabled ? null : (
          <Button
            size="xs"
            variant="ghost"
            iconName="close"
            aria-label="Remove For every"
            onClick={() =>
              update(({ forEvery: _forEvery, ...current }) =>
                mapConstraintChecks(current, (check) => ({
                  ...check,
                  subject:
                    check.subject?.id === forEvery.typeId ? null : check.subject,
                })),
              )
            }
          />
        )}
      </div>
      <div className={ruleRowStyle}>
        <Menu
          items={[
            {
              id: "places",
              label: "",
              items: petriNetDefinition.places
                .filter(
                  (place) =>
                    place.colorId === forEvery.typeId ||
                    forEvery.placeIds.includes(place.id),
                )
                .map(
                  (place): MenuItem => ({
                    id: place.id,
                    text: place.name,
                    selectedStyle: "checkbox",
                    keepOpenOnSelect: true,
                    selected: forEvery.placeIds.includes(place.id),
                    onClick: () =>
                      setForEvery({
                        placeIds: forEvery.placeIds.includes(place.id)
                          ? forEvery.placeIds.filter((id) => id !== place.id)
                          : [...forEvery.placeIds, place.id],
                      }),
                  }),
                ),
            },
          ]}
          trigger={
            <Button
              size="sm"
              variant="subtle"
              className={timeButtonStyle}
              suffix={<span className={chevronStyle} />}
              aria-label="Places"
              disabled={disabled}
            >
              {forEvery.placeIds
                .map(
                  (id) =>
                    petriNetDefinition.places.find((place) => place.id === id)
                      ?.name,
                )
                .filter(Boolean)
                .join(", ") || "Choose places"}
            </Button>
          }
        />
      </div>
    </>
  );
};

const joinItems: { value: "all" | "any"; text: string }[] = [
  { value: "all", text: "and" },
  { value: "any", text: "or" },
];

const slotStyle = css({ display: "flex", flexDirection: "column", gap: "2" });

const checkBoundStyle = css({ width: "[100%]" });

// The unit sits inside the field: the wrapper widens by the unit's length and
// the input pads right so the number never runs under it.
const boundFieldStyle = css({ position: "relative", display: "block" });

const boundUnitFieldStyle = css({
  "& input": { paddingRight: "[calc(var(--unit-chars) * 1ch + 10px)]" },
});

const boundUnitStyle = css({
  position: "absolute",
  top: "[50%]",
  left: "[min(calc(10px + var(--bound-chars) * 1ch + 4px), calc(100% - var(--unit-chars) * 1ch - 8px))]",
  transform: "[translateY(-50%)]",
  fontSize: "sm",
  color: "neutral.s100",
  pointerEvents: "none",
});

const boundUnitDisabledStyle = css({ color: "neutral.s80" });

// The word column: "if", "then" and the and/or select line up.
const leadStyle = css({ minWidth: "[64px]", flexShrink: "0" });

// Rows under a subject start under the subject, past the word column.
const indentStyle = css({ paddingLeft: "[72px]" });

const SubjectSelect: React.FC<{
  constraint: ModelConstraint;
  check: Check;
  disabled: boolean;
  placeholder: string;
  onChange: (subject: CheckSubject) => void;
}> = ({ constraint, check, disabled, placeholder, onChange }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const groups = subjectGroups(petriNetDefinition, constraint.forEvery);
  const items = groups.flatMap((group) => group.items);
  const value = check.subject ? subjectValue(check.subject) : "";
  return (
    <SubjectPicker
      groups={groups}
      value={value}
      text={items.find((item) => item.value === value)?.text}
      placeholder={placeholder}
      dotted={
        !constraint.forEvery &&
        (value.startsWith("placeTokens:") || value.startsWith("field:"))
      }
      disabled={disabled}
      onChange={(next) => {
        const subject = parseSubjectValue(next);
        if (subject) {
          onChange(subject);
        }
      }}
    />
  );
};

const opItemStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "4",
  width: "[100%]",
});

const opSymbolStyle = css({ color: "neutral.s90" });

const OpSelect: React.FC<{
  check: Check;
  disabled: boolean;
  onChange: (op: CheckOp) => void;
}> = ({ check, disabled, onChange }) => (
  <Select
    required
    size="sm"
    width="fitContent"
    aria-label="Comparison"
    disabled={disabled}
    value={check.op}
    items={checkOps.map((op) => ({ value: op, text: checkOpLabel[op] }))}
    renderItem={(value) => {
      const op = checkOps.find((candidate) => candidate === value);
      return op ? (
        <span className={opItemStyle}>
          {checkOpLabel[op]}
          <span className={opSymbolStyle}>{checkOpSymbol[op]}</span>
        </span>
      ) : (
        value
      );
    }}
    renderSelectedItem={(value) => {
      const op = checkOps.find((candidate) => candidate === value);
      return op ? checkOpLabel[op] : value;
    }}
    onChange={(value) => {
      const op = checkOps.find((candidate) => candidate === value);
      if (op) {
        onChange(op);
      }
    }}
  />
);

const BoundInput: React.FC<{
  check: Check;
  disabled: boolean;
  unit?: string | null;
  onChange: (bound: number | null) => void;
}> = ({ check, disabled, unit, onChange }) => {
  const base = 56 - (unit ? 8 : 0);
  return (
    <span
      className={cx(boundFieldStyle, unit && boundUnitFieldStyle)}
      style={
        {
          width: unit ? `calc(${base}px + ${unit.length}ch)` : `${base}px`,
          "--unit-chars": unit?.length ?? 0,
          "--bound-chars": Math.max(String(check.bound ?? "").length, 1),
        } as React.CSSProperties
      }
    >
      <NumberInput
        size="sm"
        aria-label="Bound"
        hideStepper
        step="any"
        min={Number.MIN_SAFE_INTEGER}
        className={checkBoundStyle}
        disabled={disabled}
        value={check.bound}
        onChange={onChange}
      />
      {unit ? (
        <span className={cx(boundUnitStyle, disabled && boundUnitDisabledStyle)}>
          {unit}
        </span>
      ) : null}
    </span>
  );
};

/** The comparison and its bound. An event has neither: it happens or not. */
const Comparison: React.FC<{
  check: Check;
  disabled: boolean;
  onChange: (patch: Partial<Check>) => void;
}> = ({ check, disabled, onChange }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  if (isEventSubject(check.subject)) {
    return null;
  }
  return (
    <div className={cx(ruleRowStyle, tightRowStyle, noWrapStyle)}>
      <OpSelect
        check={check}
        disabled={disabled}
        onChange={(op) => onChange({ op })}
      />
      <BoundInput
        check={check}
        unit={subjectUnit(petriNetDefinition, check.subject)}
        disabled={disabled}
        onChange={(bound) => onChange({ bound })}
      />
    </div>
  );
};

const RemoveButton: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => (
  <Button
    size="xs"
    variant="ghost"
    iconName="close"
    aria-label={label}
    onClick={onClick}
  />
);

const JoinSelect: React.FC<{
  join: "all" | "any" | undefined;
  disabled: boolean;
  onChange: (join: "all" | "any") => void;
}> = ({ join, disabled, onChange }) => (
  <span className={leadStyle}>
    <Select
      required
      size="sm"
      width="fitContent"
      aria-label="and or"
      disabled={disabled}
      value={join ?? "all"}
      items={joinItems}
      onChange={(value) => {
        if (value === "all" || value === "any") {
          onChange(value);
        }
      }}
    />
  </span>
);

const LeadWord: React.FC<{ word: string; disabled: boolean }> = ({
  word,
  disabled,
}) => <span className={cx(mutedText(disabled), leadStyle)}>{word}</span>;

/** One condition: a lead (and/or, if), the subject, then the comparison. */
const ConditionRow: React.FC<{
  constraint: ModelConstraint;
  check: Check;
  disabled: boolean;
  lead: React.ReactNode;
  onChange: (patch: Partial<Check>) => void;
  onRemove?: () => void;
}> = ({ constraint, check, disabled, lead, onChange, onRemove }) => (
  <div className={slotStyle}>
    <div className={cx(ruleRowStyle, tightRowStyle)}>
      {lead}
      <SubjectSelect
        constraint={constraint}
        check={check}
        disabled={disabled}
        placeholder="Choose…"
        onChange={(subject) => onChange({ subject })}
      />
      {onRemove && !disabled ? (
        <RemoveButton label="Remove condition" onClick={onRemove} />
      ) : null}
    </div>
    {isEventSubject(check.subject) ? null : (
      <div className={lead ? indentStyle : undefined}>
        <Comparison check={check} disabled={disabled} onChange={onChange} />
      </div>
    )}
  </div>
);

type WindowChoice = "whole" | ConstraintWindow["kind"];

const windowChoiceItems: { value: WindowChoice; text: string }[] = [
  { value: "whole", text: "whole run" },
  { value: "within", text: "within" },
  { value: "between", text: "between" },
];

/** Every time word but "at the end of the run" takes a window: the whole run, within T, or between a and b. */
const WindowFields: React.FC<{
  time: TimeWord;
  window: ConstraintWindow | undefined;
  disabled: boolean;
  onChange: (window: ConstraintWindow | undefined) => void;
}> = ({ time, window, disabled, onChange }) => {
  if (!takesWindow(time)) {
    return null;
  }
  const setChoice = (choice: WindowChoice) => {
    if (choice === "whole") {
      onChange(undefined);
    } else if (choice === "within") {
      onChange({ kind: "within", to: window?.to ?? 30 });
    } else {
      onChange({
        kind: "between",
        from: window?.kind === "between" ? window.from : 0,
        to: window?.to ?? 30,
      });
    }
  };
  const setBound = (bound: "from" | "to", value: number | null) => {
    if (value === null || !window) {
      return;
    }
    onChange(
      window.kind === "between"
        ? { ...window, [bound]: value }
        : { kind: "within", to: value },
    );
  };

  return (
    <div className={cx(ruleRowStyle, tightRowStyle)}>
      <Select
        required
        size="sm"
        width="fitContent"
        aria-label="Time window"
        disabled={disabled}
        value={window?.kind ?? "whole"}
        items={windowChoiceItems}
        onChange={(value) => {
          if (value === "whole" || value === "within" || value === "between") {
            setChoice(value);
          }
        }}
      />
      {window ? (
        <div className={cx(ruleRowStyle, tightRowStyle, noWrapStyle)}>
          {window.kind === "between" ? (
            <>
              <NumberInput
                size="sm"
                aria-label="Window start, in days"
                hideStepper
                step="any"
                className={numberStyle}
                disabled={disabled}
                value={window.from}
                onChange={(value) => setBound("from", value)}
              />
              <span className={mutedText(disabled)}>and</span>
            </>
          ) : null}
          <NumberInput
            size="sm"
            aria-label="Window end, in days"
            hideStepper
            step="any"
            className={numberStyle}
            disabled={disabled}
            value={window.to}
            onChange={(value) => setBound("to", value)}
          />
          <span className={mutedText(disabled)}>days</span>
        </div>
      ) : null}
    </div>
  );
};

const nestedCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingX: "3",
  paddingY: "2",
  backgroundColor: "neutral.s20",
  borderLeft: "[2px solid]",
  borderLeftColor: "neutral.s80",
  borderRadius: "md",
});

const bracketStyle = css({
  fontFamily: "mono",
  fontSize: "sm",
  color: "neutral.s90",
  lineHeight: "[1]",
});

const nestedHeaderStyle = css({ "& > :last-child": { marginLeft: "auto" } });

const warningStyle = css({
  fontSize: "xs",
  color: "yellow.s110",
  backgroundColor: "yellow.s10",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "1.5",
});

const NEST_CAP_HINT =
  "Two levels at most here. Write deeper rules as code.";

type ItemsChange = (change: (items: RuleItem[]) => RuleItem[]) => void;

/**
 * A list of conditions joined by and/or. The first row can leave its subject
 * to the head row, so the rule reads: the thing, the time word, the condition.
 */
const ConditionList: React.FC<{
  constraint: ModelConstraint;
  items: RuleItem[];
  join: "all" | "any" | undefined;
  disabled: boolean;
  /** The first condition's subject sits in the head row. */
  headSubject?: boolean;
  /** Inside a nested rule: no deeper nesting. */
  nested?: boolean;
  setItems: ItemsChange;
  setJoin: (join: "all" | "any") => void;
}> = ({
  constraint,
  items,
  join,
  disabled,
  headSubject,
  nested,
  setItems,
  setJoin,
}) => {
  const many = items.length >= 2;
  const updateCheck = (index: number, patch: Partial<Check>) =>
    setItems((current) =>
      current.map((item, at) =>
        at === index && !isNestedRule(item) ? { ...item, ...patch } : item,
      ),
    );
  const remove = (index: number) =>
    setItems((current) => current.filter((_, at) => at !== index));

  return (
    <>
      {items.map((item, index) => {
        const lead =
          index === 0 ? null : (
            <JoinSelect join={join} disabled={disabled} onChange={setJoin} />
          );
        if (isNestedRule(item)) {
          return (
            // eslint-disable-next-line react/no-array-index-key -- Conditions have no ids; rows are only added or removed by position.
            <div key={index} className={slotStyle}>
              {lead}
              {/* eslint-disable-next-line no-use-before-define -- A nested rule holds a condition list, which holds nested rules. */}
              <NestedRuleCard
                constraint={constraint}
                rule={item}
                disabled={disabled}
                onChange={(change) =>
                  setItems((current) =>
                    current.map((entry, at) =>
                      at === index && isNestedRule(entry) ? change(entry) : entry,
                    ),
                  )
                }
                onRemove={() => remove(index)}
              />
            </div>
          );
        }
        if (index === 0 && headSubject) {
          return (
            // eslint-disable-next-line react/no-array-index-key -- Conditions have no ids; rows are only added or removed by position.
            <div key={index} className={cx(ruleRowStyle, tightRowStyle)}>
              <Comparison
                check={item}
                disabled={disabled}
                onChange={(patch) => updateCheck(index, patch)}
              />
            </div>
          );
        }
        return (
          <ConditionRow
            // eslint-disable-next-line react/no-array-index-key -- Conditions have no ids; rows are only added or removed by position.
            key={index}
            constraint={constraint}
            check={item}
            disabled={disabled}
            lead={lead}
            onChange={(patch) => updateCheck(index, patch)}
            onRemove={many ? () => remove(index) : undefined}
          />
        );
      })}
      {disabled ? null : (
        <div className={addButtonsStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="plus"
            onClick={() =>
              setItems((current) => {
                // A new condition reads the same thing as the one before it.
                const last = current.findLast(
                  (entry): entry is Check => !isNestedRule(entry),
                );
                return [
                  ...current,
                  { ...emptyCheck(), subject: last?.subject ?? null },
                ];
              })
            }
          >
            Add condition
          </Button>
          {nested ? (
            <Tooltip
              content={<span className={hintTextStyle}>{NEST_CAP_HINT}</span>}
              position="top"
            >
              <span>
                <Button size="xs" variant="ghost" iconName="listTree" disabled>
                  Nest a rule
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              iconName="listTree"
              onClick={() =>
                setItems((current) => [...current, newNestedRule()])
              }
            >
              Nest a rule
            </Button>
          )}
        </div>
      )}
    </>
  );
};

/** A rule inside a rule: a bracket group with its own time word and window. */
const NestedRuleCard: React.FC<{
  constraint: ModelConstraint;
  rule: NestedRule;
  disabled: boolean;
  onChange: (change: (rule: NestedRule) => NestedRule) => void;
  onRemove: () => void;
}> = ({ constraint, rule, disabled, onChange, onRemove }) => (
  <div className={nestedCardStyle}>
    <span className={bracketStyle}>(</span>
    <div className={cx(ruleRowStyle, tightRowStyle, nestedHeaderStyle)}>
      <TimeWordMenu
        basic
        time={rule.time}
        disabled={disabled}
        onChange={(time) => onChange((current) => ({ ...current, time }))}
      />
      <WindowFields
        time={rule.time}
        window={rule.window}
        disabled={disabled}
        onChange={(window) =>
          onChange(({ window: _window, ...current }) =>
            window ? { ...current, window } : current,
          )
        }
      />
      {disabled ? null : (
        <RemoveButton label="Remove nested rule" onClick={onRemove} />
      )}
    </div>
    <ConditionList
      nested
      constraint={constraint}
      items={rule.checks}
      join={rule.join}
      disabled={disabled}
      setItems={(change) =>
        onChange((current) => {
          const next = change(current.checks);
          return { ...current, checks: next.length > 0 ? next : [emptyCheck()] };
        })
      }
      setJoin={(join) => onChange((current) => ({ ...current, join }))}
    />
    <span className={bracketStyle}>)</span>
  </div>
);

type Slot = "checks" | "second";

const RuleRows: React.FC<{
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update: save }) => {
  // An edit in the full builder keeps the rule in Custom, so the card never
  // swaps to a pattern's slots while someone is building.
  const update: UpdateConstraint = (change) =>
    save((current) => ({ ...change(current), preset: "custom" }));
  const { petriNetDefinition: net } = use(SDCPNContext);
  const trigger = constraint.trigger;

  const setItems =
    (slot: Slot): ItemsChange =>
    (change) =>
      update((current) => {
        const next = change(
          slot === "second" ? secondChecks(current) : current.checks,
        );
        const filled = next.length > 0 ? next : [emptyCheck()];
        return slot === "second"
          ? { ...current, second: filled }
          : { ...current, checks: filled };
      });

  const setJoin = (slot: Slot) => (join: "all" | "any") =>
    update((current) =>
      slot === "second" ? { ...current, secondJoin: join } : { ...current, join },
    );

  const setTime = (time: TimeWord) =>
    update(({ window, ...current }) => ({
      ...current,
      time,
      ...(window && takesWindow(time) ? { window } : {}),
      ...(hasSecondSlot(time) && !current.second?.length
        ? { second: [emptyCheck()] }
        : {}),
    }));

  const timeAndWindow = (
    <>
      <TimeWordMenu
        time={constraint.time}
        disabled={disabled}
        onChange={setTime}
      />
      <WindowFields
        time={constraint.time}
        window={constraint.window}
        disabled={disabled}
        onChange={(next) =>
          update(({ window: _window, ...current }) =>
            next ? { ...current, window: next } : current,
          )
        }
      />
    </>
  );

  const forEveryRows = constraint.forEvery ? (
    <ForEveryRows
      forEvery={constraint.forEvery}
      disabled={disabled}
      update={update}
    />
  ) : null;

  const extraButtons =
    disabled || hasSecondSlot(constraint.time) ? null : (
      <div className={addButtonsStyle}>
        {trigger ? null : (
          <Button
            size="xs"
            variant="ghost"
            iconName="plus"
            onClick={() =>
              update((current) => ({
                ...current,
                trigger: { ...emptyCheck(), op: "above", bound: 0 },
              }))
            }
          >
            If … then
          </Button>
        )}
        {constraint.forEvery || net.types.length === 0 ? null : (
          <Button
            size="xs"
            variant="ghost"
            iconName="plus"
            onClick={() =>
              update((current) => {
                // Start from the type of the place the first condition reads, if any.
                const subject = firstCheck(current.checks)?.subject;
                const place = net.places.find(
                  ({ id }) => subject?.kind !== "metric" && id === subject?.id,
                );
                const typed = net.types.find(({ id }) => id === place?.colorId);
                return {
                  ...mapConstraintChecks(current, (check) => ({
                    ...check,
                    subject: null,
                  })),
                  forEvery: {
                    typeId: (typed ?? net.types[0]!).id,
                    where: "in",
                    placeIds: typed && place ? [place.id] : [],
                  },
                };
              })
            }
          >
            For every…
          </Button>
        )}
      </div>
    );

  const contradiction =
    contradictionIn(constraint.checks, constraint.join) ||
    (hasSecondSlot(constraint.time) &&
      contradictionIn(secondChecks(constraint), constraint.secondJoin)) ? (
      <div className={warningStyle}>
        These conditions can&apos;t all hold at once.
      </div>
    ) : null;

  if (hasSecondSlot(constraint.time)) {
    return (
      <>
        {forEveryRows}
        <div className={slotStyle}>
          <ConditionList
            constraint={constraint}
            items={constraint.checks}
            join={constraint.join}
            disabled={disabled}
            setItems={setItems("checks")}
            setJoin={setJoin("checks")}
          />
        </div>
        <div className={cx(ruleRowStyle, tightRowStyle)}>{timeAndWindow}</div>
        <div className={slotStyle}>
          <ConditionList
            constraint={constraint}
            items={secondChecks(constraint)}
            join={constraint.secondJoin}
            disabled={disabled}
            setItems={setItems("second")}
            setJoin={setJoin("second")}
          />
        </div>
        {contradiction}
      </>
    );
  }

  if (trigger) {
    return (
      <>
        {forEveryRows}
        <div className={cx(ruleRowStyle, tightRowStyle)}>{timeAndWindow}</div>
        <ConditionRow
          constraint={constraint}
          check={trigger}
          disabled={disabled}
          lead={<LeadWord word="if" disabled={disabled} />}
          onChange={(patch) =>
            update((current) => ({
              ...current,
              trigger: current.trigger && { ...current.trigger, ...patch },
            }))
          }
          onRemove={() =>
            update(({ trigger: _trigger, ...current }) => current)
          }
        />
        <div className={cx(ruleRowStyle, tightRowStyle)}>
          <LeadWord word="then" disabled={disabled} />
        </div>
        <div className={slotStyle}>
          <ConditionList
            constraint={constraint}
            items={constraint.checks}
            join={constraint.join}
            disabled={disabled}
            setItems={setItems("checks")}
            setJoin={setJoin("checks")}
          />
        </div>
        {contradiction}
        {extraButtons}
      </>
    );
  }

  const head = constraint.checks[0];
  const headCheck = head && !isNestedRule(head) ? head : undefined;
  return (
    <>
      {forEveryRows}
      <div className={cx(ruleRowStyle, tightRowStyle)}>
        {headCheck ? (
          <SubjectSelect
            constraint={constraint}
            check={headCheck}
            disabled={disabled}
            placeholder={
              constraint.forEvery ? "Choose field" : "Choose what to check"
            }
            onChange={(subject) =>
              setItems("checks")((items) =>
                items.map((item, at) =>
                  at === 0 && !isNestedRule(item) ? { ...item, subject } : item,
                ),
              )
            }
          />
        ) : null}
        {timeAndWindow}
      </div>
      <div className={slotStyle}>
        <ConditionList
          headSubject={headCheck !== undefined}
          constraint={constraint}
          items={constraint.checks}
          join={constraint.join}
          disabled={disabled}
          setItems={setItems("checks")}
          setJoin={setJoin("checks")}
        />
      </div>
      {contradiction}
      {extraButtons}
    </>
  );
};

/**
 * A picked pattern shows only its slots, as D20 draws it: no time-word menu,
 * no nesting. Custom opens the full builder. Set to false to always show the
 * full builder.
 */
const PATTERN_SLOTS_VIEW = true;

const patternLeadWord: Record<string, string> = {
  always: "always",
  never: "never",
  once: "at least once",
};

/** The fill-in sentence of a pattern. Every slot writes into the same rule data as the builder. */
const PatternSlots: React.FC<{
  constraint: ModelConstraint;
  pattern: string;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, pattern, disabled, update }) => {
  const patchFirst = (items: RuleItem[], patch: Partial<Check>): RuleItem[] =>
    items.map((item, at) =>
      at === 0 && !isNestedRule(item) ? { ...item, ...patch } : item,
    );
  const forEveryRows = constraint.forEvery ? (
    <ForEveryRows
      forEvery={constraint.forEvery}
      disabled={disabled}
      update={update}
    />
  ) : null;
  const windowRow = (
    <div className={cx(ruleRowStyle, tightRowStyle)}>
      <LeadWord word="during" disabled={disabled} />
      <WindowFields
        time={constraint.time}
        window={constraint.window}
        disabled={disabled}
        onChange={(next) =>
          update(({ window: _window, ...current }) =>
            next ? { ...current, window: next } : current,
          )
        }
      />
    </div>
  );

  if (pattern === "response") {
    const nested = constraint.checks[0];
    const rule = nested && isNestedRule(nested) ? nested : null;
    const then = rule?.checks[0];
    const within = rule?.window?.to ?? null;
    const setNested = (change: (current: NestedRule) => NestedRule) =>
      update((current) => ({
        ...current,
        checks: current.checks.map((item, at) =>
          at === 0 && isNestedRule(item) ? change(item) : item,
        ),
      }));
    return (
      <>
        {forEveryRows}
        {constraint.trigger ? (
          <ConditionRow
            constraint={constraint}
            check={constraint.trigger}
            disabled={disabled}
            lead={<LeadWord word="Whenever" disabled={disabled} />}
            onChange={(patch) =>
              update((current) => ({
                ...current,
                trigger: current.trigger && { ...current.trigger, ...patch },
              }))
            }
          />
        ) : null}
        {then && !isNestedRule(then) ? (
          <ConditionRow
            constraint={constraint}
            check={then}
            disabled={disabled}
            lead={<LeadWord word="then" disabled={disabled} />}
            onChange={(patch) =>
              setNested((current) => ({
                ...current,
                checks: patchFirst(current.checks, patch),
              }))
            }
          />
        ) : null}
        <div className={cx(ruleRowStyle, tightRowStyle, noWrapStyle)}>
          <LeadWord word="within" disabled={disabled} />
          <NumberInput
            size="sm"
            aria-label="Within, in days"
            hideStepper
            step="any"
            className={numberStyle}
            disabled={disabled}
            value={within}
            onChange={(value) => {
              if (value !== null) {
                setNested((current) => ({
                  ...current,
                  window: { kind: "within", to: value },
                }));
              }
            }}
          />
          <span className={mutedText(disabled)}>days</span>
        </div>
      </>
    );
  }

  if (pattern === "precedence") {
    // The rule stores "not Y until, if ever, X". The slot shows Y as written.
    const stored = constraint.checks[0];
    const y = stored && !isNestedRule(stored) ? stored : null;
    const x = constraint.second?.[0];
    return (
      <>
        {forEveryRows}
        {y ? (
          <ConditionRow
            constraint={constraint}
            check={negateCheck(y)}
            disabled={disabled}
            lead={<LeadWord word="" disabled={disabled} />}
            onChange={(patch) =>
              update((current) => ({
                ...current,
                checks: current.checks.map((item, at) =>
                  at === 0 && !isNestedRule(item)
                    ? negateCheck({ ...negateCheck(item), ...patch })
                    : item,
                ),
              }))
            }
          />
        ) : null}
        {x && !isNestedRule(x) ? (
          <ConditionRow
            constraint={constraint}
            check={x}
            disabled={disabled}
            lead={<LeadWord word="only after" disabled={disabled} />}
            onChange={(patch) =>
              update((current) => ({
                ...current,
                second: patchFirst(current.second ?? [], patch),
              }))
            }
          />
        ) : null}
      </>
    );
  }

  const first = constraint.checks[0];
  return (
    <>
      {forEveryRows}
      {first && !isNestedRule(first) ? (
        <ConditionRow
          constraint={constraint}
          check={first}
          disabled={disabled}
          lead={
            <LeadWord word={patternLeadWord[pattern] ?? ""} disabled={disabled} />
          }
          onChange={(patch) =>
            update((current) => ({
              ...current,
              checks: patchFirst(current.checks, patch),
            }))
          }
        />
      ) : null}
      {windowRow}
    </>
  );
};

const lineNumbersStyle = css({
  margin: "0",
  textAlign: "right",
  userSelect: "none",
  color: "neutral.s70",
  flexShrink: "0",
});

const codeBoxStyle = css({
  display: "flex",
  gap: "3",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  padding: "2",
  fontFamily: "mono",
  fontSize: "xs",
  lineHeight: "[18px]",
  color: "neutral.s120",
  "& textarea": {
    flex: "1",
    minWidth: "0",
    padding: "0",
    margin: "0",
    border: "none",
    outline: "none",
    resize: "none",
    background: "[transparent]",
    font: "[inherit]",
    lineHeight: "[inherit]",
    color: "[inherit]",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "normal",
    overflowX: "hidden",
    fieldSizing: "content",
  },
});

const nestedNoteStyle = css({
  fontSize: "[12px]",
  color: "neutral.s100",
  marginTop: "-1",
});

const codeCaptionStyle = css({
  fontSize: "[11px]",
  color: "neutral.s90",
  marginBottom: "-1",
});

const patternHintStyle = css({
  display: "block",
  fontSize: "xs",
  color: "neutral.s100",
});

type PatternUndo = { before: ModelConstraint; after: string };

// Key order and unset fields differ once a rule is saved and read back.
const ruleKey = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry)
            .filter(([, field]) => field !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : entry,
  );

/**
 * The pattern follows the rule: editing the rows re-reads which pattern fits.
 * After a switch, Undo brings the rule back until the rule is edited again.
 */
const PatternSelect: React.FC<{
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update }) => {
  const [undo, setUndo] = useState<PatternUndo | null>(null);
  const canUndo =
    !disabled && undo !== null && undo.after === ruleKey(constraint);

  return (
    <div className={ruleRowStyle}>
      <Select
        required
        size="sm"
        width="fitContent"
        aria-label="Pattern"
        disabled={disabled}
        value={rulePatternOf(constraint)}
        items={rulePatterns.map(({ id, label }) => ({ value: id, text: label }))}
        renderItem={(value) => {
          const pattern = rulePatterns.find(({ id }) => id === value);
          return (
            <span>
              {pattern?.label ?? value}
              <span className={patternHintStyle}>{pattern?.hint}</span>
            </span>
          );
        }}
        renderSelectedItem={(value) =>
          rulePatterns.find(({ id }) => id === value)?.label ?? value
        }
        onChange={(id) => {
          const next = applyPattern(constraint, id);
          setUndo({ before: constraint, after: ruleKey(next) });
          update(() => next);
        }}
      />
      {canUndo ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            update(() => undo.before);
            setUndo(null);
          }}
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
};

const CODE_CAPTION = "MTL · Zeroth's format is not defined yet";

const CodeEditor: React.FC<{
  constraint: ModelConstraint;
  code: string;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, code, disabled, update }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const draft = useDraftField({ sourceId: constraint.id, sourceValue: code });
  const generated = constraintCodeText(petriNetDefinition, constraint);
  const lines = draft.value.split("\n");

  return (
    <>
      <div className={codeBoxStyle}>
        <pre className={lineNumbersStyle} aria-hidden="true">
          {lines.map((_, index) => index + 1).join("\n")}
        </pre>
        <textarea
          aria-label="Rule code"
          rows={lines.length}
          spellCheck={false}
          disabled={disabled}
          value={draft.value}
          onChange={(event) => draft.setValue(event.target.value)}
          onBlur={() => {
            if (draft.value !== code) {
              update((current) => ({ ...current, code: draft.value }));
            }
          }}
        />
      </div>
      {ruleDepth(constraint) <= MAX_ROW_DEPTH ? (
        <div className={codeActionsStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="list"
            disabled={disabled}
            // Keeps the textarea from blurring, which would save the draft first.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => update(({ code: _code, ...current }) => current)}
          >
            {code === generated && draft.value === code
              ? "Edit as rows"
              : "Edit as rows (discards code edits)"}
          </Button>
        </div>
      ) : (
        <div className={cx(nestedNoteStyle, disabled && disabledTextStyle)}>Rules deeper than two levels stay as code.</div>
      )}
    </>
  );
};

const ConstraintMainFields: React.FC<{ constraint: ModelConstraint }> = ({
  constraint,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { updateConstraints } = useConstraints();
  const isReadOnly = useIsReadOnly();

  const update: UpdateConstraint = (change) =>
    updateConstraints((all) =>
      all.map((candidate) =>
        candidate.id === constraint.id ? change(candidate) : candidate,
      ),
    );

  const generated = constraintCode(petriNetDefinition, constraint);
  const generatedText = constraintCodeText(petriNetDefinition, constraint);

  return (
    <div className={sectionStyle}>
      <Form.Section>
        <DraftFieldInput
          label="Name"
          sourceId={constraint.id}
          sourceValue={constraint.name}
          validate={validateDisplayName}
          onCommit={(name) => update((current) => ({ ...current, name }))}
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Form.Section>

      <div>
        <div className={headingStyle}>Rule</div>
        <div className={ruleCardStyle}>
          <PatternSelect
            constraint={constraint}
            disabled={isReadOnly}
            update={update}
          />
          {constraint.code === undefined &&
          ruleDepth(constraint) <= MAX_ROW_DEPTH ? (
            <>
              {PATTERN_SLOTS_VIEW && rulePatternOf(constraint) !== "custom" ? (
                <PatternSlots
                  constraint={constraint}
                  pattern={rulePatternOf(constraint)}
                  disabled={isReadOnly}
                  update={update}
                />
              ) : (
                <RuleRows
                  constraint={constraint}
                  disabled={isReadOnly}
                  update={update}
                />
              )}
              <div className={codeCaptionStyle}>{CODE_CAPTION}</div>
              <div className={codeLineStyle}>{breakableCode(generated)}</div>
              {isReadOnly ? null : (
                <div className={codeActionsStyle}>
                  <Button
                    size="xs"
                    variant="ghost"
                    iconName="code"
                    onClick={() =>
                      update((current) => ({ ...current, code: generatedText }))
                    }
                  >
                    Edit as code
                  </Button>
                </div>
              )}
            </>
          ) : (
            <CodeEditor
              constraint={constraint}
              code={constraint.code ?? generatedText}
              disabled={isReadOnly}
              update={update}
            />
          )}
        </div>
      </div>

      <div>
        <div className={headingStyle}>Across runs</div>
        <div className={cx(ruleRowStyle, noWrapStyle)}>
          <span className={mutedText(isReadOnly)}>must hold in</span>
          <NumberInput
            size="sm"
            aria-label="Tolerance"
            hideStepper
            max={100}
            className={numberStyle}
            disabled={isReadOnly}
            value={constraint.tolerance}
            onChange={(value) => {
              if (value !== null) {
                update((current) => ({ ...current, tolerance: value }));
              }
            }}
          />
          <span className={mutedText(isReadOnly)}>% of runs</span>
        </div>
      </div>
    </div>
  );
};

const ConstraintContext = createContext<ModelConstraint | null>(null);

const ConstraintMainContent: React.FC = () => {
  const constraint = use(ConstraintContext);
  if (!constraint) {
    throw new Error(
      "ConstraintMainContent must be used within ConstraintProperties",
    );
  }
  return <ConstraintMainFields constraint={constraint} />;
};

export const ConstraintProperties: React.FC<{ constraintId: string }> = ({
  constraintId,
}) => {
  const { constraints } = useConstraints();
  const constraint = constraints.find(
    (candidate) => candidate.id === constraintId,
  );
  if (!constraint) {
    return null;
  }

  const subViews: SubView[] = [
    {
      id: "constraint-main-content",
      title: `Constraint ${constraint.name}`,
      icon: ConstraintIcon,
      main: true,
      component: ConstraintMainContent,
    },
  ];

  return (
    <div className={containerStyle}>
      <ConstraintContext value={constraint}>
        <VerticalSubViewsContainer
          key={constraint.id}
          name="constraint-properties"
          subViews={subViews}
        />
      </ConstraintContext>
    </div>
  );
};
