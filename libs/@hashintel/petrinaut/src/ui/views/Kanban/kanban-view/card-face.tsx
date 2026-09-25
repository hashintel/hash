import { Icon, type IconName } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

// A Kanban card: key, optional highlight badge, chosen token fields and a
// meta line. Shared by the live board and board setup.

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2",
  borderRadius: "sm",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s00",
  shadow: "[0px 1px 3px rgba(0, 0, 0, 0.06)]",
  textAlign: "left",
  width: "full",
});
const clickableStyle = css({
  cursor: "pointer",
  _hover: { borderColor: "neutral.s90" },
});
const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  alignSelf: "flex-start",
  fontSize: "[11px]",
  fontWeight: "semibold",
});
const keyStyle = css({
  display: "block",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s125",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const fieldsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  columnGap: "2",
  fontSize: "[11px]",
  color: "neutral.s110",
});
const fieldStyle = css({
  display: "inline-flex",
  gap: "1",
  maxWidth: "full",
  minWidth: "[0]",
  whiteSpace: "nowrap",
});
const fieldLabelStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: "[0]",
});
const fieldValueStyle = css({
  flexShrink: 0,
  fontWeight: "medium",
  color: "neutral.s120",
  fontVariantNumeric: "tabular-nums",
});

export type CardHighlight = {
  name: string;
  color: string;
  icon?: string | null;
};

export const CardFace = ({
  title,
  highlight,
  fields,
  meta,
  previewColor,
  onClick,
  testId,
  dataAttributes,
}: {
  title: string;
  highlight?: CardHighlight | null;
  fields?: { label: string; value: string }[];
  meta?: ReactNode;
  /** Dashed border for a card a rule would catch if it checked more places. */
  previewColor?: string | null;
  /** Makes the whole card a button. */
  onClick?: () => void;
  testId?: string;
  dataAttributes?: Record<string, string | undefined>;
}) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cx(cardStyle, onClick && clickableStyle)}
      data-testid={testId}
      data-kanban-interactive=""
      {...dataAttributes}
      style={{
        ...(highlight
          ? {
              borderColor: highlight.color,
              backgroundColor: `color-mix(in srgb, ${highlight.color} 9%, var(--colors-neutral-s00))`,
            }
          : {}),
        ...(previewColor
          ? { borderColor: previewColor, borderStyle: "dashed" }
          : {}),
      }}
    >
      {highlight && (
        <span className={badgeStyle} style={{ color: highlight.color }}>
          {highlight.icon && (
            <Icon name={highlight.icon as IconName} size="xs" />
          )}
          {highlight.name}
        </span>
      )}
      <span className={keyStyle}>{title}</span>
      {fields && fields.length > 0 && (
        <span className={fieldsStyle}>
          {fields.map((field) => (
            <span
              key={field.label}
              className={fieldStyle}
              title={`${field.label} ${field.value}`}
            >
              <span className={fieldLabelStyle}>{field.label}</span>
              <span className={fieldValueStyle}>{field.value}</span>
            </span>
          ))}
        </span>
      )}
      {meta}
    </Tag>
  );
};
