import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { CardFace, type CardHighlight } from "../kanban-view/card-face";
import {
  describeRule,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_ICONS,
  humanizeField,
  type DraftRule,
} from "./draft-rules";

// Prototype: "What cards show", one panel for the fields every card shows
// and the look of each highlight. Opens from the board header or a card.

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
});
const faintStyle = css({ fontSize: "[11px]", color: "neutral.s90" });
const exampleTagStyle = css({
  alignSelf: "flex-start",
  fontSize: "[11px]",
  color: "neutral.s110",
  borderWidth: "[1px]",
  borderStyle: "dashed",
  borderColor: "neutral.s90",
  borderRadius: "sm",
  paddingX: "1.5",
});
const previewStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  maxWidth: "[240px]",
});
const checkRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "neutral.s120",
  cursor: "pointer",
});
const highlightCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderRadius: "lg",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
});
const highlightHeadStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "sm",
  fontWeight: "semibold",
});
const swatchRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1.5",
});
const swatchStyle = css({
  width: "[18px]",
  height: "[18px]",
  borderRadius: "full",
  cursor: "pointer",
});
const swatchOnStyle = css({
  boxShadow:
    "[0 0 0 2px var(--colors-neutral-s00), 0 0 0 4px var(--colors-blue-s90)]",
});
const glyphStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "[26px]",
  height: "[26px]",
  paddingX: "1.5",
  borderRadius: "md",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.subtle",
  fontSize: "[11px]",
  color: "neutral.s110",
  cursor: "pointer",
});
const glyphOnStyle = css({
  borderColor: "[transparent]",
  backgroundColor: "blue.s20",
  color: "neutral.s125",
  boxShadow:
    "[0 0 0 2px var(--colors-neutral-s00), 0 0 0 4px var(--colors-blue-s90)]",
});
const fadeStyle = css({
  position: "sticky",
  bottom: "[-16px]",
  height: "[24px]",
  marginTop: "[-24px]",
  flexShrink: 0,
  pointerEvents: "none",
  backgroundImage:
    "[linear-gradient(to bottom, transparent, var(--colors-neutral-s00))]",
});
const linkStyle = css({
  alignSelf: "flex-start",
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "blue.s100",
  cursor: "pointer",
});

const GLYPH_NAMES: Record<(typeof HIGHLIGHT_ICONS)[number], string> = {
  warning: "Warning",
  diamondExclamation: "Alert",
  clock: "Time",
  lightning: "Fast",
  starFilled: "Star",
  bell: "Notice",
};

/** Cards stay scannable: the key plus at most this many fields. */
const MAX_CARD_FIELDS = 3;

export const CardsPanel = ({
  identityName,
  fieldOptions,
  cardFields,
  onToggleField,
  rules,
  labelName,
  onChangeRule,
  onEditRule,
  preview,
}: {
  identityName: string;
  fieldOptions: { name: string; type: string; everywhere: boolean }[];
  cardFields: string[];
  onToggleField: (name: string) => void;
  rules: DraftRule[];
  labelName: (labelId: string) => string;
  onChangeRule: (ruleId: string, patch: Partial<DraftRule>) => void;
  onEditRule: (labelId: string) => void;
  /** A live card to preview; null before any run. */
  preview: {
    title: string;
    highlight: CardHighlight | null;
    fields: { label: string; value: string }[];
  } | null;
}) => {
  const firstRule = rules[0];
  const example = preview ?? {
    title: `${identityName} 1`,
    highlight: firstRule
      ? {
          name: firstRule.name || "Flagged",
          color: firstRule.color,
          icon: firstRule.icon,
        }
      : null,
    fields: cardFields.map((name) => ({
      label: humanizeField(name, identityName),
      value: "…",
    })),
  };

  return (
    <>
      <div className={sectionStyle}>
        <span className={labelStyle}>Preview</span>
        <div className={previewStyle}>
          {!preview && (
            <span className={exampleTagStyle}>
              Example preview · not simulation data
            </span>
          )}
          <CardFace
            title={example.title}
            highlight={example.highlight}
            fields={example.fields}
          />
        </div>
      </div>

      <div className={sectionStyle}>
        <span className={labelStyle}>
          Fields on every card · up to {MAX_CARD_FIELDS}
        </span>
        {fieldOptions.map((option) => (
          <label key={option.name} className={checkRowStyle}>
            <input
              type="checkbox"
              checked={cardFields.includes(option.name)}
              disabled={
                !cardFields.includes(option.name) &&
                cardFields.length >= MAX_CARD_FIELDS
              }
              onChange={() => onToggleField(option.name)}
            />
            {humanizeField(option.name, identityName)}
            {!option.everywhere && (
              <span className={faintStyle}>only some places</span>
            )}
          </label>
        ))}
        {fieldOptions.length === 0 && (
          <span className={faintStyle}>
            These tokens carry no fields besides the key.
          </span>
        )}
      </div>

      <div className={sectionStyle}>
        <span className={labelStyle}>Highlights</span>
        {rules.length > 1 && (
          <span className={faintStyle}>
            A card shows the first highlight that matches.
          </span>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={highlightCardStyle}
            data-testid="highlight-style"
          >
            <div className={highlightHeadStyle} style={{ color: rule.color }}>
              {rule.icon && <Icon name={rule.icon} size="xs" />}
              {rule.name || "Flagged"}
            </div>
            <span className={faintStyle}>
              On {labelName(rule.labelId)} · when {describeRule(rule)}
            </span>
            <div className={swatchRowStyle} role="group" aria-label="Colour">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Colour ${color}`}
                  aria-pressed={rule.color === color}
                  className={cx(
                    swatchStyle,
                    rule.color === color && swatchOnStyle,
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => onChangeRule(rule.id, { color })}
                />
              ))}
            </div>
            <div className={swatchRowStyle} role="group" aria-label="Glyph">
              <button
                type="button"
                aria-pressed={rule.icon === null}
                className={cx(glyphStyle, rule.icon === null && glyphOnStyle)}
                onClick={() => onChangeRule(rule.id, { icon: null })}
              >
                None
              </button>
              {HIGHLIGHT_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  aria-label={`Glyph ${icon}`}
                  title={GLYPH_NAMES[icon]}
                  aria-pressed={rule.icon === icon}
                  className={cx(glyphStyle, rule.icon === icon && glyphOnStyle)}
                  onClick={() => onChangeRule(rule.id, { icon })}
                >
                  <Icon name={icon} size="xs" />
                </button>
              ))}
            </div>
            <button
              type="button"
              className={linkStyle}
              onClick={() => onEditRule(rule.labelId)}
            >
              Edit rule
            </button>
          </div>
        ))}
        {rules.length === 0 && (
          <span className={faintStyle}>
            No highlights yet. Add a rule on a status to create one.
          </span>
        )}
      </div>
      <div className={fadeStyle} aria-hidden="true" />
    </>
  );
};
