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
      blue: { backgroundColor: "blue.s20", color: "blue.s110" },
      neutral: { backgroundColor: "neutral.s20", color: "neutral.s100" },
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
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[15px]",
  color: "neutral.s90",
});

/** A panel section: its title, then rows 8 px apart. Sections sit 20 px apart (the panel's gap). */
export const Section = ({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section
    className={css({ display: "flex", flexDirection: "column", gap: "2" })}
  >
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "[15px]",
      })}
    >
      <div className={sectionTitleStyle}>{title}</div>
      {/* The action overhangs the 15 px title line, so it adds no height. */}
      {action ? (
        <span
          className={css({
            display: "flex",
            alignItems: "center",
            height: "[15px]",
          })}
        >
          {action}
        </span>
      ) : null}
    </div>
    {children}
  </section>
);

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[128px minmax(0, 1fr)]",
  columnGap: "2",
  // Baselines line the key up with the first line of any value: a chip, a field or plain text.
  alignItems: "baseline",
});

export const keyStyle = css({
  // A block, not an inline-block: an inline-block that clips takes its bottom edge as its baseline.
  display: "block",
  maxWidth: "[128px]",
  // The DS tooltip trigger sets line-height 0, which would clip an inline block.
  lineHeight: "[16px]",
  fontSize: "[13px]",
  color: "neutral.s90",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** The DS tooltip trigger sets line-height 0, which would lift the key off the value's baseline. */
const keyTipStyle = css({ "&[class]": { lineHeight: "[16px]" } });

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
  label: React.ReactNode;
  hover?: string;
  required?: boolean;
  children: React.ReactNode;
  invalid?: boolean;
}) => {
  const tip = hover && required ? `${hover} · required` : hover;
  return (
    <div className={rowStyle} data-invalid={invalid || undefined}>
      {tip ? (
        <Tooltip content={tip} position="left" className={keyTipStyle}>
          <span className={keyStyle}>{label}</span>
        </Tooltip>
      ) : (
        <span className={keyStyle}>{label}</span>
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
  backgroundColor: "neutral.s20",
  fontSize: "xs",
  lineHeight: "[17px]",
  color: "neutral.s120",
  textAlign: "left",
  _hover: { backgroundColor: "neutral.s30" },
  _focusWithin: { outline: "[2px solid var(--colors-blue-s90)]" },
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
    "& svg": { width: "[10px]", height: "[10px]" },
  },
  variants: {
    tone: {
      green: { backgroundColor: "green.s10", color: "green.s100" },
      orange: { backgroundColor: "orange.s10", color: "orange.s100" },
      blue: { backgroundColor: "blue.s10", color: "blue.s100" },
      neutral: { backgroundColor: "neutral.s00", color: "neutral.s100" },
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
  backgroundColor: "neutral.s30",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[16px]",
  height: "[16px]",
  borderRadius: "sm",
  color: "neutral.s90",
  cursor: "pointer",
  opacity: "[0]",
  _hover: { backgroundColor: "neutral.s40", color: "neutral.s120" },
  _focusVisible: { opacity: "[1]" },
});

export type Tone = "green" | "orange" | "neutral" | "blue";

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
  fontSize: "xs",
  lineHeight: "[17px]",
  color: "neutral.s90",
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

/**
 * DS fields at the size the Figma DS draws them in panels: 32 px tall, 14 px medium, #202020. The code DS's sm is
 * 28 px and its md is 16 px, so this lifts sm to 32 px. The attribute selector outranks the size recipe.
 */
export const fieldStyle = css({
  "&[class]": {
    "--form-padding-y": "[4px]",
    "--form-line-height": "[22px]",
  },
  "&[class] :is(input, button, [data-part=value-text])": {
    fontWeight: "medium",
    color: "neutral.s120",
  },
});

/** The DS Select Trigger's look (↳ Current, md): 32 px, 8 px corners, 14 px medium, a chevron on the right. */
export const selectTriggerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "[100%]",
  height: "[32px]",
  paddingLeft: "2.5",
  paddingRight: "2.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a60",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.s120",
  textAlign: "left",
  cursor: "pointer",
  "& > span": {
    flex: "1",
    minWidth: "[0]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "& > svg": { color: "neutral.s100", flexShrink: 0 },
  "&[data-placeholder]": { color: "neutral.s90" },
  _hover: { borderColor: "neutral.a80" },
  _focusVisible: { outline: "[2px solid var(--colors-blue-s90)]" },
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
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "[14px]",
  color: "neutral.s110",
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
      color: "neutral.s110",
    })}
  >
    {icon ? <Icon name={icon} size="sm" /> : null}
    {children}
  </div>
);

/** The description under the header's type: 12 px muted text that edits in place. */
export const descriptionInputStyle = css({
  width: "[100%]",
  fontSize: "xs",
  lineHeight: "[15px]",
  color: "neutral.s90",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  borderRadius: "xs",
  padding: "[0]",
  outline: "none",
  _placeholder: { color: "neutral.s80" },
  _hover: { color: "neutral.s100" },
  _focusVisible: { boxShadow: "[0 0 0 2px var(--colors-blue-a40)]" },
});

export { cx };
