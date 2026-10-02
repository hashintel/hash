import { createContext, use } from "react";

import {
  Button,
  Form,
  Menu,
  NumberInput,
  SegmentedControl,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import {
  constraintCode,
  constraintModeHint,
  constraintModeNote,
  emptyCheck,
  forEveryHint,
  constraintModeLabel,
  parseSubjectValue,
  subjectGroups,
  subjectUnit,
  subjectValue,
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
import { LastExperiment } from "./constraint-results";
import { ConstraintIcon } from "./constraint-tree";

import type {
  Check,
  CheckOp,
  CheckSubject,
  ConstraintMode,
  ConstraintWindow,
  ModelConstraint,
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

const modeNoteStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
  marginTop: "0",
});

// Lines may break only after ", " and "=> "; other spaces become non-breaking.
const breakableCode = (code: string) =>
  code
    .split(/(, |=> )/)
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

const addButtonsStyle = css({ display: "flex", gap: "1", marginLeft: "-1" });

const codeActionsStyle = css({ display: "flex", justifyContent: "flex-end" });

const dotStyle = css({
  display: "inline-block",
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  backgroundColor: "neutral.s90",
  marginRight: "1.5",
  flexShrink: "0",
});

// The tooltip trigger zeroes its line height for icons, so text needs its own.
const tooltipFillStyle = css({
  display: "block",
  width: "[100%]",
  lineHeight: "[20px]",
});

type UpdateConstraint = (
  update: (current: ModelConstraint) => ModelConstraint,
) => void;

const opItems: { value: CheckOp; text: string }[] = [
  { value: "below", text: "stays below" },
  { value: "above", text: "stays above" },
];

type WindowKind = "whole" | "between" | "within";

const windowItems: { value: WindowKind; text: string }[] = [
  { value: "whole", text: "whole run" },
  { value: "between", text: "between" },
  { value: "within", text: "within" },
];

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
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update }) => {
  const wordItem = (word: TimeWord, position: Position): MenuItem => ({
    id: word,
    text: withHint(word, position),
    selectedStyle: "tick",
    selected: constraint.time === word,
    onClick: () => update((current) => ({ ...current, time: word })),
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
            wordItem("eventually", "right-start"),
            wordItem("until", "right-start"),
          ],
        },
        {
          id: "more-words",
          label: "",
          items: [
            {
              id: "more",
              text: "More",
              subItems: [wordItem("release", "bottom-end")],
            },
          ],
        },
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
          {timeWordLabel[constraint.time]}
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
              ...current,
              forEvery: current.forEvery && { ...current.forEvery, typeId },
              checks: current.checks.map((check) => ({
                ...check,
                subject: null,
              })),
              trigger: current.trigger && { ...current.trigger, subject: null },
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
              update(({ forEvery: _forEvery, ...current }) => ({
                ...current,
                checks: current.checks.map((check) => ({
                  ...check,
                  subject:
                    check.subject?.id === forEvery.typeId ? null : check.subject,
                })),
                trigger: current.trigger && {
                  ...current.trigger,
                  subject:
                    current.trigger.subject?.id === forEvery.typeId
                      ? null
                      : current.trigger.subject,
                },
              }))
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

const ModeMenu: React.FC<{
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update }) => {
  const modeItem = (mode: ConstraintMode): MenuItem => ({
    id: mode,
    text: withTextHint(
      constraintModeLabel[mode],
      constraintModeHint[mode],
      "right-start",
      true,
    ),
    selectedStyle: "tick",
    selected: constraint.mode === mode,
    onClick: () => update((current) => ({ ...current, mode })),
  });

  return (
    <Menu
      className={timeMenuStyle}
      items={[
        {
          id: "modes",
          label: "",
          items: [
            modeItem("monitored"),
            modeItem("enforcedSoft"),
            modeItem("enforcedHard"),
          ],
        },
        { id: "stop", label: "", items: [modeItem("stopEarly")] },
      ]}
      trigger={
        <Button
          size="sm"
          variant="subtle"
          className={timeButtonStyle}
          suffix={<span className={chevronStyle} />}
          aria-label="When it fails"
          disabled={disabled}
        >
          {constraintModeLabel[constraint.mode]}
        </Button>
      }
    />
  );
};

const windowKindOf = (window: ConstraintWindow | undefined): WindowKind =>
  window ? window.kind : "whole";

const joinItems: { value: "all" | "any"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "any", label: "Any" },
];

const triggerOpItems: { value: CheckOp; text: string }[] = [
  { value: "above", text: "is above" },
  { value: "below", text: "is below" },
];

const removeSlotStyle = css({ display: "flex", justifyContent: "center" });

// The If row and the check rows share four column tracks (subject, comparison,
// bound, remove), so their fields line up. The subject gives way first.
const checkGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, max-content) max-content max-content 16px]",
  columnGap: "1.5",
  rowGap: "2",
  alignItems: "center",
});

const gridRowStyle = css({ gridColumn: "[1 / -1]" });

const ifCellStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "0",
  "& > :last-child": { flex: "1", minWidth: "0" },
});

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

const SubjectSelect: React.FC<{
  constraint: ModelConstraint;
  check: Check;
  disabled: boolean;
  placeholder: string;
  fill?: boolean;
  onChange: (subject: CheckSubject) => void;
}> = ({ constraint, check, disabled, placeholder, fill, onChange }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const groups = subjectGroups(petriNetDefinition, constraint.forEvery);
  const items = groups.flatMap((group) => group.items);
  return (
    <Select
      required
      size="sm"
      width={fill ? "fullWidth" : "fitContent"}
      aria-label="Subject"
      disabled={disabled}
      placeholder={placeholder}
      value={check.subject ? subjectValue(check.subject) : ""}
      items={groups}
      renderItem={(value) => {
        const text = items.find((item) => item.value === value)?.text;
        const dotted = !constraint.forEvery && !value.startsWith("metric:");
        return (
          <span>
            {dotted ? <span className={dotStyle} /> : null}
            {text ?? value}
          </span>
        );
      }}
      onChange={(value) => {
        const subject = value ? parseSubjectValue(value) : null;
        if (subject) {
          onChange(subject);
        }
      }}
    />
  );
};

const OpSelect: React.FC<{
  check: Check;
  disabled: boolean;
  items: { value: CheckOp; text: string }[];
  fill?: boolean;
  onChange: (op: CheckOp) => void;
}> = ({ check, disabled, items, fill, onChange }) => (
  <Select
    required
    size="sm"
    width={fill ? "fullWidth" : "fitContent"}
    aria-label="Comparison"
    disabled={disabled}
    value={check.op}
    items={items}
    onChange={(value) => {
      if (value === "below" || value === "above") {
        onChange(value);
      }
    }}
  />
);

const BoundInput: React.FC<{
  check: Check;
  disabled: boolean;
  compact?: boolean;
  unit?: string | null;
  onChange: (bound: number | null) => void;
}> = ({ check, disabled, compact, unit, onChange }) => {
  const base = (compact ? 48 : 56) - (unit ? 8 : 0);
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

/** One check as a row of its own: subject, comparison, bound and an optional remove. */
const CheckRow: React.FC<{
  constraint: ModelConstraint;
  check: Check;
  disabled: boolean;
  trigger?: boolean;
  onChange: (patch: Partial<Check>) => void;
  onRemove?: () => void;
}> = ({ constraint, check, disabled, trigger, onChange, onRemove }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const subject = (
    <SubjectSelect
      fill
      constraint={constraint}
      check={check}
      disabled={disabled}
      placeholder="Choose…"
      onChange={(next) => onChange({ subject: next })}
    />
  );
  return (
    <>
      {trigger ? (
        <div className={ifCellStyle}>
          <span className={mutedText(disabled)}>If</span>
          {subject}
        </div>
      ) : (
        subject
      )}
      <OpSelect
        fill
        check={check}
        disabled={disabled}
        items={trigger ? triggerOpItems : opItems}
        onChange={(op) => onChange({ op })}
      />
      <BoundInput
        compact
        check={check}
        unit={subjectUnit(petriNetDefinition, check.subject)}
        disabled={disabled}
        onChange={(bound) => onChange({ bound })}
      />
      <span className={removeSlotStyle}>
        {onRemove && !disabled ? (
          <Button
            size="xs"
            variant="ghost"
            iconName="close"
            aria-label={trigger ? "Remove If" : "Remove check"}
            onClick={onRemove}
          />
        ) : null}
      </span>
    </>
  );
};

const MatchSwitch: React.FC<{
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update }) => (
  <>
    <span className={mutedText(disabled)}>match</span>
    <SegmentedControl
      size="xs"
      aria-label="Match"
      items={joinItems}
      value={constraint.join ?? "all"}
      disabled={disabled}
      onChange={(join) => update((current) => ({ ...current, join }))}
    />
  </>
);

const RuleRows: React.FC<{
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update }) => {
  const window = constraint.window;
  const trigger = constraint.trigger;
  const manyChecks = constraint.checks.length >= 2;
  const asList = manyChecks || trigger !== undefined;

  const updateCheck = (index: number, patch: Partial<Check>) =>
    update((current) => ({
      ...current,
      checks: current.checks.map((candidate, at) =>
        at === index ? { ...candidate, ...patch } : candidate,
      ),
    }));

  const setWindowKind = (kind: WindowKind) =>
    update((current) => {
      const { window: previous, ...rest } = current;
      const to = previous?.to ?? 30;
      return kind === "whole"
        ? rest
        : {
            ...rest,
            window:
              kind === "between"
                ? { kind, from: 0, to }
                : { kind: "within", to },
          };
    });

  const setWindowBound = (bound: "from" | "to", value: number | null) =>
    update((current) => {
      if (!current.window || value === null) {
        return current;
      }
      return current.window.kind === "between"
        ? { ...current, window: { ...current.window, [bound]: value } }
        : { ...current, window: { kind: "within", to: value } };
    });

  const { petriNetDefinition: net } = use(SDCPNContext);
  const forEveryRows = constraint.forEvery ? (
    <ForEveryRows
      forEvery={constraint.forEvery}
      disabled={disabled}
      update={update}
    />
  ) : null;

  const windowRow = (
    <div className={ruleRowStyle}>
      <Select
        required
        size="sm"
        width="fitContent"
        aria-label="Time window"
        disabled={disabled}
        value={windowKindOf(window)}
        items={windowItems}
        onChange={(value) => {
          if (value === "whole" || value === "between" || value === "within") {
            setWindowKind(value);
          }
        }}
      />
      {window?.kind === "between" ? (
        <>
          <NumberInput
            size="sm"
            aria-label="Window start, in days"
            hideStepper
            step="any"
            className={numberStyle}
            disabled={disabled}
            value={window.from}
            onChange={(value) => setWindowBound("from", value)}
          />
          <span className={mutedText(disabled)}>and</span>
        </>
      ) : null}
      {window ? (
        <>
          <NumberInput
            size="sm"
            aria-label="Window end, in days"
            hideStepper
            step="any"
            className={numberStyle}
            disabled={disabled}
            value={window.to}
            onChange={(value) => setWindowBound("to", value)}
          />
          <span className={mutedText(disabled)}>days</span>
        </>
      ) : null}
    </div>
  );

  const addButtons = disabled ? null : (
    <div className={addButtonsStyle}>
      <Button
        size="xs"
        variant="ghost"
        iconName="plus"
        onClick={() =>
          update((current) => ({
            ...current,
            checks: [...current.checks, emptyCheck()],
          }))
        }
      >
        Add check
      </Button>
      {trigger ? null : (
        <Button
          size="xs"
          variant="ghost"
          iconName="plus"
          onClick={() =>
            update((current) => ({
              ...current,
              trigger: { ...emptyCheck(), op: "above" },
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
              // Start from the type of the place the first check reads, if any.
              const subject = current.checks[0]?.subject;
              const place = net.places.find(
                ({ id }) => subject?.kind !== "metric" && id === subject?.id,
              );
              const typed = net.types.find(({ id }) => id === place?.colorId);
              return {
              ...current,
              forEvery: {
                typeId: (typed ?? net.types[0]!).id,
                where: "in",
                placeIds: typed && place ? [place.id] : [],
              },
              checks: current.checks.map((check) => ({
                ...check,
                subject: null,
              })),
              trigger: current.trigger && { ...current.trigger, subject: null },
              };
            })
          }
        >
          For every…
        </Button>
      )}
    </div>
  );

  if (!asList) {
    const check = constraint.checks[0] ?? emptyCheck();
    const unit = subjectUnit(net, check.subject);
    if (constraint.forEvery) {
      return (
        <>
          {forEveryRows}
          <div className={cx(ruleRowStyle, tightRowStyle)}>
            <TimeWordMenu
              constraint={constraint}
              disabled={disabled}
              update={update}
            />
            <SubjectSelect
              constraint={constraint}
              check={check}
              disabled={disabled}
              placeholder="Choose field"
              onChange={(subject) => updateCheck(0, { subject })}
            />
            <div className={cx(ruleRowStyle, tightRowStyle, noWrapStyle)}>
              <OpSelect
                check={check}
                disabled={disabled}
                items={opItems}
                onChange={(op) => updateCheck(0, { op })}
              />
              <BoundInput
                check={check}
                unit={unit}
                disabled={disabled}
                onChange={(bound) => updateCheck(0, { bound })}
              />
            </div>
          </div>
          {windowRow}
          {addButtons}
        </>
      );
    }
    return (
      <>
        {forEveryRows}
        <div className={ruleRowStyle}>
          <TimeWordMenu
            constraint={constraint}
            disabled={disabled}
            update={update}
          />
          <SubjectSelect
            constraint={constraint}
            check={check}
            disabled={disabled}
            placeholder="Choose what to check"
            onChange={(subject) => updateCheck(0, { subject })}
          />
        </div>
        <div className={ruleRowStyle}>
          <OpSelect
            check={check}
            disabled={disabled}
            items={opItems}
            onChange={(op) => updateCheck(0, { op })}
          />
          <BoundInput
            check={check}
            unit={unit}
            disabled={disabled}
            onChange={(bound) => updateCheck(0, { bound })}
          />
        </div>
        {windowRow}
        {addButtons}
      </>
    );
  }

  return (
    <>
      {forEveryRows}
      <div className={ruleRowStyle}>
        <TimeWordMenu
          constraint={constraint}
          disabled={disabled}
          update={update}
        />
        {trigger || !manyChecks ? null : (
          <MatchSwitch
            constraint={constraint}
            disabled={disabled}
            update={update}
          />
        )}
      </div>
      <div className={checkGridStyle}>
        {trigger ? (
          <>
            <CheckRow
              trigger
              constraint={constraint}
              check={trigger}
              disabled={disabled}
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
            <div className={cx(ruleRowStyle, gridRowStyle)}>
              <span className={mutedText(disabled)}>then</span>
              {manyChecks ? (
                <MatchSwitch
                  constraint={constraint}
                  disabled={disabled}
                  update={update}
                />
              ) : null}
            </div>
          </>
        ) : null}
        {constraint.checks.map((check, index) => (
          <CheckRow
            // eslint-disable-next-line react/no-array-index-key -- Checks have no ids; rows are only added or removed by position.
            key={index}
            constraint={constraint}
            check={check}
            disabled={disabled}
            onChange={(patch) => updateCheck(index, patch)}
            onRemove={
              manyChecks
                ? () =>
                    update((current) => ({
                      ...current,
                      checks: current.checks.filter((_, at) => at !== index),
                    }))
                : undefined
            }
          />
        ))}
      </div>
      {windowRow}
      {addButtons}
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
    overflowWrap: "anywhere",
    overflowX: "hidden",
    fieldSizing: "content",
  },
});

const nestedNoteStyle = css({
  fontSize: "[12px]",
  color: "neutral.s100",
  marginTop: "-1",
});

const CodeEditor: React.FC<{
  constraint: ModelConstraint;
  code: string;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, code, disabled, update }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const draft = useDraftField({ sourceId: constraint.id, sourceValue: code });
  const generated = constraintCode(petriNetDefinition, constraint);
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
      {code === generated ? (
        <div className={codeActionsStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="list"
            disabled={disabled}
            onClick={() => update(({ code: _code, ...current }) => current)}
          >
            Edit as rows
          </Button>
        </div>
      ) : (
        <div className={cx(nestedNoteStyle, disabled && disabledTextStyle)}>Nested rules stay as code.</div>
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
          {constraint.code === undefined ? (
            <>
              <RuleRows
                constraint={constraint}
                disabled={isReadOnly}
                update={update}
              />
              <div className={codeLineStyle}>{breakableCode(generated)}</div>
              {isReadOnly ? null : (
                <div className={codeActionsStyle}>
                  <Button
                    size="xs"
                    variant="ghost"
                    iconName="code"
                    onClick={() =>
                      update((current) => ({ ...current, code: generated }))
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
              code={constraint.code}
              disabled={isReadOnly}
              update={update}
            />
          )}
        </div>
      </div>

      <div>
        <div className={headingStyle}>Across runs</div>
        <div className={ruleRowStyle}>
          <ModeMenu
            constraint={constraint}
            disabled={isReadOnly}
            update={update}
          />
          <div className={cx(ruleRowStyle, noWrapStyle)}>
            <span className={mutedText(isReadOnly)}>· must hold in</span>
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
        <div className={cx(modeNoteStyle, isReadOnly && disabledTextStyle)}>
          {constraintModeNote[constraint.mode]}
        </div>
      </div>

      <LastExperiment constraint={constraint} />
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
