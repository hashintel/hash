import { useState } from "react";

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
      green: {
        backgroundColor: "green.bgSolid.surface.active",
        color: "green.fg.link",
      },
      orange: {
        backgroundColor: "orange.bgSolid.surface.active",
        color: "orange.fg.link",
      },
      blue: {
        backgroundColor: "blue.bgSolid.surface.active",
        color: "blue.fg.link",
      },
      neutral: {
        backgroundColor: "neutral.bgSolid.surface.active",
        color: "neutral.fg.muted",
      },
    },
    size: {
      sm: { width: "[24px]", height: "[24px]" },
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
  tone?: "green" | "orange" | "neutral" | "blue";
  size?: "sm" | "md";
}) => (
  <span className={tile({ tone, size })}>
    <Icon name={icon} size="sm" />
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

/** Figma ↳ Current panels: 12 px medium, muted, sentence case. */
export const sectionTitleStyle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "neutral.fg.muted",
});

const sectionGridStyle = css({
  display: "grid",
  // One label column for the whole panel (Aakarsh, 21 Oct; ops/research/panel-label-layout): every value starts at
  // the same x in every section. Long labels truncate and show in full on hover.
  gridTemplateColumns: "minmax(88px, min(30%, 120px)) minmax(0, 1fr)",
  columnGap: "2",
  rowGap: "2",
  // Baselines line the label up with the first line of any value: a chip, a field or plain text.
  alignItems: "baseline",
  "& > :not([data-row])": { gridColumn: "1 / -1" },
});

/**
 * A panel section (Aakarsh, 21 Oct): its title, then its rows on one grid whose label column fits the section's
 * longest label (`max-content 1fr`), so values start right after it. Anything that is not a row, and wide controls
 * (the condition builder, text areas), span both columns with their label above.
 */
export const Section = ({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section
    className={css({ display: "flex", flexDirection: "column", gap: "2" })}
  >
    {title ? (
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <div className={sectionTitleStyle}>{title}</div>
        {action}
      </div>
    ) : null}
    <div className={sectionGridStyle}>{children}</div>
  </section>
);

export const keyStyle = css({
  // A block, not an inline-block: an inline-block that clips takes its bottom edge as its baseline.
  display: "block",
  maxWidth: "[100%]",
  textStyle: "sm",
  color: "neutral.fg.muted",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** "optional", after the label of a field that may stay empty (Attio: only the exception is marked). */
export const OptionalMark = () => (
  <span
    className={css({
      display: "block",
      textStyle: "xxs",
      fontWeight: "medium",
      color: "neutral.fg.muted.disabled",
    })}
  >
    optional
  </span>
);

/** The DS tooltip trigger sets line-height 0, which would lift the key off the value's baseline. */
const keyTipStyle = css({ "&[class]": { textStyle: "sm" } });

/**
 * D27 A: one row of the properties table. A muted key, the value, and (below the value) where it comes from. The
 * key's hover gives the type; nothing says "from" or "to". An optional field says so under its key.
 */
export const PropertyRow = ({
  label,
  hover,
  required,
  optional,
  children,
  invalid,
}: {
  label: React.ReactNode;
  hover?: string;
  required?: boolean;
  /** Marks the key "optional". */
  optional?: boolean;
  children: React.ReactNode;
  invalid?: boolean;
}) => {
  // The label's hover always carries the full label, since a long one truncates.
  const named = typeof label === "string" ? label : undefined;
  const detail = hover && required ? `${hover} · required` : hover;
  const tip = named && detail ? `${named} · ${detail}` : (detail ?? named);
  const key = (
    <span className={css({ display: "block", minWidth: "[0]" })}>
      <span className={keyStyle}>{label}</span>
      {optional ? <OptionalMark /> : null}
    </span>
  );
  return (
    <div
      className={css({ display: "contents" })}
      data-row
      data-invalid={invalid || undefined}
    >
      {tip ? (
        <Tooltip content={tip} position="top" className={keyTipStyle}>
          {key}
        </Tooltip>
      ) : (
        key
      )}
      <div
        className={css({
          minWidth: "[0]",
          display: "flex",
          flexDirection: "column",
          gap: "1.5",
        })}
      >
        {children}
      </div>
    </div>
  );
};

const sourceChipStyle = css({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  maxWidth: "[100%]",
  paddingLeft: "1",
  paddingRight: "2",
  paddingY: "1",
  borderRadius: "md",
  backgroundColor: "neutral.bgSolid.surface.active",
  textStyle: "sm",
  color: "neutral.fg.body",
  textAlign: "left",
  _hover: { backgroundColor: "neutral.bgSolid.subtle" },
  _focusWithin: { outline: "[2px solid var(--colors-blue-bd-strong)]" },
});

const chipTileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "[16px]",
    height: "[16px]",
    borderRadius: "sm",
    "&[class] svg": {
      width: "[10px]",
      height: "[10px]",
      "--icon-size": "10px",
    },
  },
  variants: {
    tone: {
      green: {
        backgroundColor: "green.bgSolid.surface.active",
        color: "green.fg.muted",
      },
      orange: {
        backgroundColor: "orange.bgSolid.surface.active",
        color: "orange.fg.muted",
      },
      blue: {
        backgroundColor: "blue.bgSolid.surface.active",
        color: "blue.fg.muted",
      },
      neutral: {
        backgroundColor: "neutral.bgSolid.min",
        color: "neutral.fg.muted",
      },
    },
  },
  defaultVariants: { tone: "neutral" },
});

const chipRemoveStyle = css({
  // Overlays the chip's end on hover, so the resting chip keeps its 8 px right padding.
  position: "absolute",
  right: "[4px]",
  top: "[50%]",
  transform: "[translateY(-50%)]",
  backgroundColor: "neutral.bgSolid.subtle",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[16px]",
  height: "[16px]",
  borderRadius: "sm",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  opacity: "[0]",
  _hover: {
    backgroundColor: "neutral.bgSolid.subtle.hover",
    color: "neutral.fg.body",
  },
  _focusVisible: { opacity: "[1]" },
});

export type Tone = "green" | "orange" | "neutral" | "blue";

const moreChipStyle = css({
  flexShrink: 0,
  paddingX: "2",
  paddingY: "1",
  borderRadius: "md",
  backgroundColor: "neutral.bgSolid.surface.active",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bgSolid.subtle" },
});

/**
 * Several chips on one line: the first, then "+N"; hovering +N lists the rest, clicking it shows them all (Aakarsh,
 * 21 Oct: multi-value chips stay on one line).
 */
export const ChipRow = ({
  children,
  names,
}: {
  children: React.ReactNode[];
  /** The chips' names, for the +N hover. */
  names: string[];
}) => {
  const [all, setAll] = useState(false);
  const rest = children.length - 1;
  return (
    <div
      className={css({
        display: "flex",
        flexWrap: all ? "wrap" : "nowrap",
        alignItems: "center",
        gap: "1.5",
        minWidth: "[0]",
        "& > *:first-child": { minWidth: "[0]", flexShrink: 1 },
      })}
    >
      {all ? children : children.slice(0, 1)}
      {!all && rest > 0 ? (
        <Tooltip content={names.slice(1).join(", ")}>
          <button
            type="button"
            className={moreChipStyle}
            aria-label={`Show ${rest} more`}
            onClick={() => setAll(true)}
          >
            +{rest}
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
};

/** The ↳ Current source chip: a 16 px tile with the node's icon, then its name in 12 px. × shows on hover (J3 D1). */
export const SourceChip = ({
  icon,
  tone,
  children,
  onClick,
  onRemove,
  label,
}: {
  icon: IconName;
  tone?: Tone;
  children: React.ReactNode;
  onClick?: () => void;
  onRemove?: () => void;
  label?: string;
}) => (
  <span
    className={cx(
      sourceChipStyle,
      css({ "&:hover [data-chip-remove]": { opacity: "[1]" } }),
    )}
  >
    <button
      type="button"
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "1.5",
        minWidth: "[0]",
        cursor: "pointer",
        outline: "none",
      })}
      onClick={onClick}
      aria-label={label}
    >
      <span className={chipTileStyle({ tone })}>
        <Icon name={icon} size="xs" />
      </span>
      <span
        className={css({
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        })}
      >
        {children}
      </span>
    </button>
    {onRemove ? (
      <button
        type="button"
        className={chipRemoveStyle}
        data-chip-remove
        aria-label="Clear"
        onClick={onRemove}
      >
        <Icon name="close" size="xs" />
      </button>
    ) : null}
  </span>
);

export const mutedTextStyle = css({
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

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
        textStyle: "xxs",
        fontWeight: "medium",
        color: "neutral.fg.subtle",
        borderWidth: "thin",
        borderStyle: "dashed",
        borderColor: "neutral.bd.subtle.hover",
        borderRadius: "sm",
        paddingX: "1",
        whiteSpace: "nowrap",
      })}
    >
      {label}
    </span>
  </Tooltip>
);

/**
 * The DS Select Trigger's look at `sm` (field kinds v2: every side-panel control is 28 px), for pickers the DS has no
 * part for yet: 8 px corners, 14 px, a chevron on the right.
 */
export const selectTriggerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "[100%]",
  height: "[28px]",
  paddingLeft: "2.5",
  paddingRight: "2.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.solid",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
  textStyle: "sm",
  color: "neutral.fg.body",
  textAlign: "left",
  cursor: "pointer",
  "& > span": {
    flex: "1",
    minWidth: "[0]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "& > svg": { color: "neutral.fg.muted", flexShrink: 0 },
  "&[data-placeholder]": { color: "neutral.fg.subtle" },
  _hover: { borderColor: "neutral.bd.strong" },
  _focusVisible: { outline: "[2px solid var(--colors-blue-bd-strong)]" },
});

/** The panel header block: icon and type on one line, the description 6 px below. */
export const panelHeaderStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  "&:not(:hover):not(:focus-within) [data-header-action]": {
    opacity: "[0]",
  },
});

export const typeLineStyle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** The header's first line: a 16 px icon, 8 px, then the type in 14 px semibold. */
export const HeaderTitle = ({
  icon,
  children,
}: {
  icon?: IconName;
  children: React.ReactNode;
}) => (
  <div
    className={css({
      display: "flex",
      alignItems: "center",
      gap: "2",
      minWidth: "[0]",
      color: "neutral.fg.muted",
    })}
  >
    {icon ? <Icon name={icon} size="sm" /> : null}
    {children}
  </div>
);

/** The description under the header's type: 12 px muted text that edits in place. */
export const descriptionInputStyle = css({
  width: "[100%]",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  borderRadius: "xs",
  padding: "[0]",
  outline: "none",
  _placeholder: { color: "neutral.fg.muted.disabled" },
  _hover: { color: "neutral.fg.muted" },
  _focusVisible: { boxShadow: "[0 0 0 2px var(--colors-blue-bd-subtle)]" },
});

export { cx };
