import { Icon, type IconName, Tooltip } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import type { EditorPayloadKind } from "./mock-action-definitions";

const tile = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "md",
  },
  variants: {
    tone: {
      green: { backgroundColor: "green.s20", color: "green.s110" },
      orange: { backgroundColor: "orange.s20", color: "orange.s110" },
      neutral: { backgroundColor: "neutral.s20", color: "neutral.s100" },
    },
    size: {
      sm: { width: "[20px]", height: "[20px]" },
      md: { width: "[32px]", height: "[32px]" },
    },
  },
  defaultVariants: { tone: "green", size: "md" },
});

/** D21 grammar: an action-type icon on a coloured tile. */
export const IconTile = ({
  icon,
  tone = "green",
  size = "md",
}: {
  icon: IconName;
  tone?: "green" | "orange" | "neutral";
  size?: "sm" | "md";
}) => (
  <span className={tile({ tone, size })}>
    <Icon name={icon} size={size === "sm" ? "xxs" : "sm"} />
  </span>
);

const kindNames: Partial<Record<EditorPayloadKind, string>> = {
  EntityId: "Entity",
  EntityQuery: "Query",
  FilterCondition: "Condition",
  VersionedUrl: "Entity type",
  PersistedEntityMetadata: "Saved entity",
  FormattedText: "Formatted text",
  EntityProperty: "Property",
  PropertyPatch: "Property change",
  PropertyObjectWithMetadata: "Properties",
};

/** A payload kind as people read it, for hovers: "List of Entity". */
export const kindLabel = (kind: string | undefined, array = false) => {
  const name = kind
    ? (kindNames[kind as EditorPayloadKind] ??
      kind.replace(/([a-z])([A-Z])/g, "$1 $2"))
    : "Any";
  return array ? `List of ${name}` : name;
};

export const sectionTitleStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  letterSpacing: "[0.04em]",
  textTransform: "uppercase",
  color: "neutral.s90",
  paddingX: "4",
  paddingTop: "4",
  paddingBottom: "1",
});

export const Section = ({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section>
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingRight: "3",
      })}
    >
      <div className={sectionTitleStyle}>{title}</div>
      {action}
    </div>
    <div className={css({ paddingBottom: "2" })}>{children}</div>
  </section>
);

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[112px 1fr]",
  columnGap: "3",
  // Baselines line the key up with the first line of any value: a chip, a field or plain text.
  alignItems: "baseline",
  paddingX: "4",
  paddingY: "[6px]",
  minHeight: "[32px]",
});

const keyStyle = css({
  fontSize: "sm",
  color: "neutral.s90",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * D27 A: one row of the properties table. A muted key, the value, and (below the value) where it comes from. The
 * key's hover gives the type; nothing says "from" or "to".
 */
export const PropertyRow = ({
  label,
  hover,
  required,
  children,
  invalid,
}: {
  label: string;
  hover?: string;
  required?: boolean;
  children: React.ReactNode;
  invalid?: boolean;
}) => (
  <div className={rowStyle} data-invalid={invalid || undefined}>
    {hover ? (
      <Tooltip content={hover} position="left">
        <span className={keyStyle}>
          {label}
          {required ? (
            <span className={css({ color: "neutral.s70" })}> *</span>
          ) : null}
        </span>
      </Tooltip>
    ) : (
      <span className={keyStyle}>{label}</span>
    )}
    <div
      className={css({
        minWidth: "[0]",
        display: "flex",
        flexDirection: "column",
        gap: "1",
      })}
    >
      {children}
    </div>
  </div>
);

export const mutedTextStyle = css({ fontSize: "xs", color: "neutral.s90" });

/** A small grey marker for parts that exist only in this prototype's mock layer or an open PR. */
export const OriginMark = ({
  label,
  hover,
}: {
  label: string;
  hover: string;
}) => (
  <Tooltip content={hover}>
    <span
      className={css({
        fontSize: "[10px]",
        fontWeight: "medium",
        color: "neutral.s90",
        borderWidth: "thin",
        borderStyle: "dashed",
        borderColor: "neutral.s50",
        borderRadius: "sm",
        paddingX: "1",
        lineHeight: "[16px]",
        whiteSpace: "nowrap",
      })}
    >
      {label}
    </span>
  </Tooltip>
);

export const panelHeaderStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "3",
  paddingX: "4",
  paddingTop: "4",
  paddingBottom: "3",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
});

export const typeLineStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s90",
});

export { cx };
