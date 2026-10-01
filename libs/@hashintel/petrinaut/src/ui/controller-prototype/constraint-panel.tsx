import { createContext, use } from "react";

import {
  Button,
  Form,
  Menu,
  NumberInput,
  Select,
  TextArea,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import {
  constraintCode,
  constraintModeLabel,
  parseSubjectValue,
  subjectGroups,
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
import { ConstraintIcon } from "./constraint-tree";

import type {
  CheckOp,
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

const numberStyle = css({ width: "[56px]" });

const codeLineStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s120",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "1.5",
  overflowWrap: "anywhere",
});

const codeEditorStyle = css({
  "& textarea": { fontFamily: "mono", fontSize: "xs" },
});

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

const toleranceRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
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

const modeItems: { value: ConstraintMode; text: string }[] = [
  { value: "monitored", text: constraintModeLabel.monitored },
  { value: "enforcedSoft", text: constraintModeLabel.enforcedSoft },
  { value: "enforcedHard", text: constraintModeLabel.enforcedHard },
];

const hintTextStyle = css({ display: "block", maxWidth: "[250px]",
  fontWeight: "normal" });

const withHint = (word: TimeWord, position: Position): React.ReactNode => (
  <Tooltip
    content={<span className={hintTextStyle}>{timeWordHint[word]}</span>}
    position={position}
  >
    <span className={tooltipFillStyle}>{timeWordLabel[word]}</span>
  </Tooltip>
);

// Wider and roomier than the DS default, with the tooltip trigger and the
// "More" chevron spanning the row.
const timeMenuStyle = css({
  minWidth: "[200px]",
  "--selectable-list-item-padding-y": "[5px]",
  "& [data-part=item] > span:last-child, & [data-part=trigger-item] > span:first-child":
    { flex: "1" },
  "& [data-scope=tooltip][data-part=trigger]": { width: "[100%]" },
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

const windowKindOf = (window: ConstraintWindow | undefined): WindowKind =>
  window ? window.kind : "whole";

const RuleRows: React.FC<{
  constraint: ModelConstraint;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, disabled, update }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const groups = subjectGroups(petriNetDefinition, constraint.forEvery);
  const items = groups.flatMap((group) => group.items);
  const check = constraint.checks[0];
  const window = constraint.window;

  const updateCheck = (patch: Partial<typeof check>) =>
    update((current) => ({
      ...current,
      checks: current.checks.map((candidate, index) =>
        index === 0 ? { ...candidate, ...patch } : candidate,
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

  return (
    <>
      <div className={ruleRowStyle}>
        <TimeWordMenu
          constraint={constraint}
          disabled={disabled}
          update={update}
        />
        <Select
          size="sm"
          width="fitContent"
          aria-label="Subject"
          disabled={disabled}
          placeholder="Choose what to check"
          value={check?.subject ? subjectValue(check.subject) : ""}
          items={groups}
          renderItem={(value) => {
            const text = items.find((item) => item.value === value)?.text;
            const dotted =
              !constraint.forEvery && !value.startsWith("metric:");
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
              updateCheck({ subject });
            }
          }}
        />
      </div>
      <div className={ruleRowStyle}>
        <Select
          size="sm"
          width="fitContent"
          aria-label="Comparison"
          disabled={disabled}
          value={check?.op ?? "below"}
          items={opItems}
          onChange={(value) => {
            if (value === "below" || value === "above") {
              updateCheck({ op: value });
            }
          }}
        />
        <NumberInput
          size="sm"
          aria-label="Bound"
          hideStepper
          step="any"
          min={Number.MIN_SAFE_INTEGER}
          className={numberStyle}
          disabled={disabled}
          value={check?.bound ?? null}
          onChange={(bound) => updateCheck({ bound })}
        />
      </div>
      <div className={ruleRowStyle}>
        <Select
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
    </>
  );
};

const CodeEditor: React.FC<{
  constraint: ModelConstraint;
  code: string;
  disabled: boolean;
  update: UpdateConstraint;
}> = ({ constraint, code, disabled, update }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const draft = useDraftField({ sourceId: constraint.id, sourceValue: code });
  const generated = constraintCode(petriNetDefinition, constraint);

  return (
    <>
      <TextArea
        size="sm"
        aria-label="Rule code"
        className={codeEditorStyle}
        rows={3}
        spellcheck={false}
        disabled={disabled}
        value={draft.value}
        onChange={(value) => draft.setValue(value)}
        onBlur={() => {
          if (draft.value !== code) {
            update((current) => ({ ...current, code: draft.value }));
          }
        }}
      />
      {code === generated ? (
        <div className={codeActionsStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="list"
            disabled={disabled}
            onClick={() =>
              update(({ code: _code, ...current }) => current)
            }
          >
            Edit as rows
          </Button>
        </div>
      ) : null}
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
              <div className={codeLineStyle}>{generated}</div>
              <div className={codeActionsStyle}>
                <Button
                  size="xs"
                  variant="ghost"
                  iconName="code"
                  disabled={isReadOnly}
                  onClick={() =>
                    update((current) => ({ ...current, code: generated }))
                  }
                >
                  Edit as code
                </Button>
              </div>
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
        <div className={headingStyle}>Tolerance</div>
        <div className={toleranceRowStyle}>
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

      <div>
        <div className={headingStyle}>When it fails</div>
        <Select
          size="sm"
          width="fitContent"
          aria-label="When it fails"
          disabled={isReadOnly}
          value={constraint.mode}
          items={modeItems}
          onChange={(value) => {
            const mode = modeItems.find((item) => item.value === value);
            if (mode) {
              update((current) => ({ ...current, mode: mode.value }));
            }
          }}
        />
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
