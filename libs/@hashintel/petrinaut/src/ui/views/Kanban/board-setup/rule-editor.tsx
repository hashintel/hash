import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  buildConditionExpression,
  describeRule,
  OPERATORS,
  type DraftRule,
  type RuleOperator,
} from "./draft-rules";

import type { Place, StatusLabel } from "@hashintel/petrinaut-core";

// Prototype: one rule on a status, edited in the floating status panel.

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
  padding: "3",
  borderRadius: "lg",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  backgroundColor: "neutral.s00",
});
const headStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});
const growStyle = css({ flex: "[1]", minWidth: "[0]" });
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1.5",
  fontSize: "xs",
  color: "neutral.s110",
});
const controlStyle = css({
  height: "[28px]",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  borderRadius: "md",
  paddingX: "2",
  fontSize: "xs",
  backgroundColor: "neutral.s00",
  color: "neutral.s120",
  minWidth: "[0]",
});
const fieldSelectStyle = css({ flex: "[1 1 140px]" });
const operatorSelectStyle = css({ flex: "[0 0 56px]" });
const valueInputStyle = css({ flex: "[0 1 80px]", width: "[80px]" });
const nameInputStyle = css({ width: "[96px]" });
const expressionInputStyle = css({
  width: "full",
  fontFamily: "mono",
});
const linkStyle = css({
  alignSelf: "flex-start",
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "blue.s100",
  cursor: "pointer",
});
const sectionLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
});
const checksStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  borderWidth: "[0]",
  padding: "[0]",
  margin: "[0]",
  minWidth: "[0]",
});
const radioStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "neutral.s120",
  cursor: "pointer",
});
const alsoListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingLeft: "6",
});
const liveStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
});
const faintStyle = css({ fontSize: "[11px]", color: "neutral.s90" });
const errorStyle = css({ fontSize: "[11px]", color: "red.s105" });

export const RuleEditor = ({
  rule,
  parent,
  attributes,
  otherPlaces,
  trackedCount,
  noun,
  live,
  error,
  onChange,
  onRemove,
  onPromote,
  setPreviewRuleId,
}: {
  rule: DraftRule;
  parent: StatusLabel;
  attributes: { name: string; type: string }[];
  /** Tracked places outside the parent status, for "Also check in". */
  otherPlaces: Place[];
  trackedCount: number;
  noun: string;
  /** What the rule does on the board now; null before any run. */
  live: string | null;
  error: string | null;
  onChange: (patch: Partial<DraftRule>) => void;
  onRemove: () => void;
  onPromote: () => void;
  /** Set to this rule's id while the Checks control has hover or focus. */
  setPreviewRuleId: Dispatch<SetStateAction<string | null>>;
}) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const previewing = hovered || focused;
  useEffect(() => {
    if (!previewing) {
      return;
    }
    setPreviewRuleId(rule.id);
    return () =>
      setPreviewRuleId((current) => (current === rule.id ? null : current));
  }, [previewing, rule.id, setPreviewRuleId]);

  const finished = buildConditionExpression(rule) !== null;
  const parentName = parent.name || "this status";
  const placeNames = parent.places.length;

  return (
    <div className={cardStyle} data-testid="rule-editor">
      <div className={headStyle}>
        <Icon name="filter" size="xs" />
        <span className={growStyle}>When {describeRule(rule)}</span>
        <Button
          variant="ghost"
          size="xs"
          iconName="trash"
          aria-label="Remove rule"
          onClick={onRemove}
        />
      </div>

      {rule.expression === null ? (
        <div className={rowStyle}>
          <select
            className={cx(controlStyle, fieldSelectStyle)}
            aria-label="Field"
            value={rule.field}
            onChange={(event) => onChange({ field: event.target.value })}
          >
            {attributes.map((attribute) => (
              <option key={attribute.name} value={attribute.name}>
                {attribute.name}
              </option>
            ))}
          </select>
          <select
            className={cx(controlStyle, operatorSelectStyle)}
            aria-label="Operator"
            value={rule.operator}
            onChange={(event) =>
              onChange({ operator: event.target.value as RuleOperator })
            }
          >
            {OPERATORS.map((operator) => (
              <option key={operator.value} value={operator.value}>
                {operator.text}
              </option>
            ))}
          </select>
          <input
            className={cx(controlStyle, valueInputStyle)}
            aria-label="Value"
            placeholder="Value"
            value={rule.value}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        </div>
      ) : (
        <input
          className={cx(controlStyle, expressionInputStyle)}
          aria-label="Rule expression"
          placeholder="token.attribute >= 1"
          value={rule.expression}
          onChange={(event) => onChange({ expression: event.target.value })}
        />
      )}
      <button
        type="button"
        className={linkStyle}
        onClick={() =>
          onChange({
            expression:
              rule.expression === null
                ? (buildConditionExpression(rule) ?? "")
                : null,
          })
        }
      >
        {rule.expression === null
          ? "Write it as an expression"
          : "Use field and value"}
      </button>
      {error && <span className={errorStyle}>{error}</span>}

      <div className={rowStyle}>
        <span>Show</span>
        <input
          className={cx(controlStyle, nameInputStyle)}
          aria-label="Badge text"
          value={rule.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <span>on the card. It stays in {parentName}.</span>
      </div>

      <fieldset
        className={checksStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setFocused(false);
          }
        }}
      >
        <legend className={sectionLabelStyle}>Checks</legend>
        <label className={radioStyle}>
          <input
            type="radio"
            name={`checks-${rule.id}`}
            checked={rule.checks === "status"}
            onChange={() => onChange({ checks: "status" })}
          />
          {placeNames === 1 ? "This status's place" : "This status's places"}
        </label>
        <label className={radioStyle}>
          <input
            type="radio"
            name={`checks-${rule.id}`}
            checked={rule.checks === "also"}
            onChange={() => onChange({ checks: "also" })}
          />
          Also check in…
        </label>
        {rule.checks === "also" && (
          <div className={alsoListStyle}>
            {otherPlaces.map((place) => (
              <label key={place.id} className={radioStyle}>
                <input
                  type="checkbox"
                  checked={rule.alsoPlaceIds.includes(place.id)}
                  onChange={(event) =>
                    onChange({
                      alsoPlaceIds: event.target.checked
                        ? [...rule.alsoPlaceIds, place.id]
                        : rule.alsoPlaceIds.filter((id) => id !== place.id),
                    })
                  }
                />
                {place.name}
              </label>
            ))}
            {otherPlaces.length === 0 && (
              <span className={faintStyle}>No other {noun} places.</span>
            )}
          </div>
        )}
        <label className={radioStyle}>
          <input
            type="radio"
            name={`checks-${rule.id}`}
            checked={rule.checks === "anywhere"}
            onChange={() => onChange({ checks: "anywhere" })}
          />
          Anywhere (all {trackedCount} {noun} places)
        </label>
      </fieldset>

      {!finished ? (
        <span className={faintStyle}>Add a value to see matches.</span>
      ) : live ? (
        <span className={liveStyle} role="status">
          {live}
        </span>
      ) : (
        <span className={faintStyle}>Run the simulation to see matches.</span>
      )}

      <div>
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          disabled={!finished}
          onClick={onPromote}
        >
          Give it its own status
        </Button>
      </div>
    </div>
  );
};
