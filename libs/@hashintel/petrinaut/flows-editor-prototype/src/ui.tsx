import { useEffect, useState } from "react";

import {
  Button,
  Chip,
  Icon,
  type IconName,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { useSourceHover } from "./editor-context";
import { panelTileColor, tileColor } from "./status-colors";

import type { StepInputSource } from "./engine";
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
    // Neutral for every type (Aakarsh, 4 Nov); `tone` stays for when the Flows palette is picked.
    tone: {
      green: {
        backgroundColor: "neutral.bgSolid.surface",
        color: "neutral.fg.muted",
      },
      orange: {
        backgroundColor: "neutral.bgSolid.surface",
        color: "neutral.fg.muted",
      },
      blue: {
        backgroundColor: "neutral.bgSolid.surface",
        color: "neutral.fg.muted",
      },
      neutral: {
        backgroundColor: "neutral.bgSolid.surface",
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
  <span className={tile({ tone, size })} style={tileColor(icon)}>
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
// Section titles read above field labels: dark and semibold, as in V3 P1 (Figma 118:1748; Aakarsh, 26 Oct).
// J2.51 (3 Nov): section titles are 14 px medium, dark.
export const sectionTitleStyle = css({
  textStyle: "sm",
  lineHeight: "[14px]",
  fontWeight: "medium",
  color: "neutral.fg.heading",
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
  gridClassName,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Spacing a panel sets for its own rows (Send email's 16 px between fields). */
  gridClassName?: string;
}) => (
  // 12 px from a section's heading to its first row, in every section (Aakarsh, 4 Nov).
  <section
    className={css({ display: "flex", flexDirection: "column", gap: "3" })}
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
    <div className={cx(sectionGridStyle, gridClassName)}>{children}</div>
  </section>
);

export const keyStyle = css({
  // A block, not an inline-block: an inline-block that clips takes its bottom edge as its baseline.
  display: "block",
  maxWidth: "[100%]",
  // J1.1, J2.51: field labels are 13 px regular, subtle grey.
  fontSize: "[13px]", // token-guard: allow Figma panel labels are 13 px, between the DS xs and sm steps
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** A key that has a hover: a dotted underline on pointer-over says there is more to read. */
export const keyHoverStyle = css({
  cursor: "help",
  _hover: { textDecoration: "underline dotted", textUnderlineOffset: "[3px]" },
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
  wrapLabel,
  children,
  invalid,
}: {
  label: React.ReactNode;
  hover?: string;
  required?: boolean;
  /** Marks the key "optional". */
  optional?: boolean;
  /** Lets a label too long for the key column wrap instead of truncate. */
  wrapLabel?: boolean;
  children: React.ReactNode;
  invalid?: boolean;
}) => {
  // The label's hover always carries the full label, since a long one truncates.
  const named = typeof label === "string" ? label : undefined;
  const detail =
    hover && required && !hover.endsWith("required")
      ? `${hover} · required`
      : hover;
  const tip = named && detail ? `${named} · ${detail}` : (detail ?? named);
  const tipKey = Boolean(detail);
  const key = (
    <span className={css({ display: "block", minWidth: "[0]" })}>
      <span
        className={cx(
          keyStyle,
          tipKey && keyHoverStyle,
          wrapLabel && css({ whiteSpace: "normal", overflow: "visible" }),
        )}
      >
        {label}
      </span>
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

/**
 * A source chip (which step a value comes from or goes to): the DS `Chip` as Figma's `Chips` draws it: grey, round,
 * md (20 px), the step's icon on the left (`_showLeftIcon`). Clicking selects the step; × clears it when it can.
 */
export const SourceChip = ({
  icon,
  children,
  onClick,
  onRemove,
  label,
}: {
  icon: IconName;
  children: React.ReactNode;
  onClick?: () => void;
  onRemove?: () => void;
  label?: string;
}) => (
  <Chip
    size="md"
    shape="round"
    color="grey"
    prefix={{ iconName: icon, variant: "naked" }}
    onClick={onClick}
    removeable={onRemove ? { onRemove, "aria-label": "Clear" } : false}
    aria-label={label}
  >
    {children}
  </Chip>
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
  _focusVisible: { outline: "[2px solid var(--flows-sel-border)]" },
});

/**
 * A single-value field whose value comes from an earlier step: it stays the Select trigger it is when empty, with the
 * value's text inside (no chip, no ×). Clicking opens the source menu. Long text is clipped; the hover shows it all.
 */
export const SourceSelectTrigger = ({
  children,
  hover,
  placeholder = false,
  onClick,
  source,
  stepId,
}: {
  children: string;
  hover?: string;
  placeholder?: boolean;
  onClick: () => void;
  /** The reference shown: hovering the trigger highlights the card it comes from on the canvas. */
  source?: StepInputSource | null;
  stepId?: string;
}) => {
  const hoverProps = useSourceHover(source, stepId ?? "");
  return (
    <Tooltip content={hover ?? children}>
      <button
        type="button"
        className={selectTriggerStyle}
        style={{ alignSelf: "stretch" }}
        data-placeholder={placeholder ? "" : undefined}
        onClick={onClick}
        {...hoverProps}
      >
        <span>{children}</span>
        <Icon name="chevronDown" size="sm" />
      </button>
    </Tooltip>
  );
};

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
  lineHeight: "[14px]",
  fontWeight: "medium",
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

/** `?panelheader=old`: the two headers from before H4, read from the URL only and never remembered. */
export const oldPanelHeader =
  new URLSearchParams(globalThis.location.search).get("panelheader") === "old";

const hueHeaderStyle = css({
  display: "grid",
  gridTemplateColumns: "[40px minmax(0, 1fr)]",
  columnGap: "3",
  alignItems: "center",
});

const hueTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[40px]",
  height: "[40px]",
  borderRadius: "[8px]",
  "&[class] svg": { width: "[20px]", height: "[20px]", "--icon-size": "20px" },
});

/** Both lines on a 20 px line, the editable description too, so together they are the tile's 40 px. */
const hueLinesStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
  "& *": { lineHeight: "[20px]" },
  // The editable field's fill and ring hug its line (1 px out, not 3), so they stay clear of the title above.
  "& input": { paddingY: "[0]", marginY: "[-1px]" },
});

/** The header's title line in H4: 14 px medium on a 20 px line, so the two lines match the 40 px tile. */
export const hueTitleStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  "& > span:first-child": {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
});

/**
 * H4 (decided 5 Nov): a 40 px tile in the step's group hue spans both header lines; the title, then
 * "Action · description", start at the same x 12 px to its right.
 */
export const HueHeader = ({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <div className={hueHeaderStyle}>
    <span
      className={hueTileStyle}
      style={panelTileColor(icon)}
      aria-hidden="true"
    >
      <Icon name={icon} size="sm" />
    </span>
    <div className={hueLinesStyle}>
      <div className={hueTitleStyle}>{title}</div>
      {children}
    </div>
  </div>
);

/**
 * The description under the header's type, edited in place: Attio's side-panel field. 2 px by 6 px padding inside a
 * clear 1 px border, pulled out by the same amount (3 px, 7 px), so the text sits exactly where plain text would and
 * never moves between rest, hover and edit.
 */
export const descriptionInputStyle = css({
  width: "[calc(100% + 14px)]",
  marginX: "[-7px]",
  marginY: "[-3px]",
  paddingX: "[6px]",
  paddingY: "[2px]",
  // J2.51: "Action · description" in 14 px regular, muted.
  textStyle: "sm",
  color: "neutral.fg.muted.hover",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "[transparent]",
  borderRadius: "[8px]",
  backgroundColor: "[transparent]",
  outline: "none",
  cursor: "text",
  transition: "[background-color 0.1s ease-in-out]",
  _placeholder: { color: "neutral.fg.muted.disabled" },
  "&:hover:not(:focus)": { backgroundColor: "neutral.bg.surface.hover" },
  _focus: { borderColor: "[var(--flows-sel-border)]", color: "neutral.fg.heading" },
});

/*
 * In-place edit, measured 1:1 from Attio's workflow editor (4 Nov, ops/projects/flows-editor/references/
 * attio-inline-edit-1104). Two variants, as Attio has:
 * - Field (titles, the panel description): 8 px radius, a 1 px border that is clear at rest, a faint fill on hover,
 *   and on edit the fill goes and the border takes the selection colour. Padding sits inside the field and a
 *   matching negative margin keeps the text where it was, so nothing moves between rest, hover and edit.
 * - Card line (a step card's description): 2 px by 6 px padding with a matching negative margin, 8 px radius, the
 *   same faint fill on hover and while editing, no border. The text stays aligned with the card title and the card
 *   keeps its height.
 * The selection colour follows the palette (`--flows-sel-border`); Attio's is blue, which here means running.
 */
export const inlineFieldStyle = css({
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "[transparent]",
  borderRadius: "[8px]",
  backgroundColor: "[transparent]",
  outline: "none",
  transition: "[background-color 0.1s ease-in-out]",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  _focusVisible: { borderColor: "[var(--flows-sel-border)]" },
});

export const inlineFieldEditingStyle = css({
  "&, &:hover": {
    backgroundColor: "[transparent]",
    borderColor: "[var(--flows-sel-border)]",
  },
});

const renameTextStyle = css({
  display: "inline-flex",
  alignItems: "center",
  height: "[28px]",
  // 7 px plus the 1 px border keeps the title text 8 px in, where it sat before.
  paddingX: "[7px]",
  minWidth: "[0]",
  maxWidth: "[480px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "text",
});

const renameInputStyle = css({
  height: "[28px]",
  // 7 px plus the 1 px border keeps the title text 8 px in, where it sat before.
  paddingX: "[7px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  fieldSizing: "content",
  minWidth: "[160px]",
  maxWidth: "[480px]",
});

/**
 * The card line: a step card's description. The side padding and negative margin cancel, so the text never moves;
 * the field starts 2 px below the title line, so the two never touch (Aakarsh, 4 Nov: "too crowded").
 */
const compactTextStyle = css({
  display: "block",
  minWidth: "[0]",
  marginX: "[-6px]",
  marginTop: "[2px]",
  marginBottom: "[-2px]",
  paddingX: "[6px]",
  paddingY: "[2px]",
  borderRadius: "[8px]",
  textStyle: "xs",
  lineHeight: "tight",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "text",
  transition: "[background-color 0.1s ease-in-out]",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  _focusVisible: {
    outline: "none",
    backgroundColor: "neutral.bg.surface.hover",
  },
  "&[data-empty]": { color: "neutral.fg.subtle" },
});

const compactInputStyle = css({
  display: "block",
  width: "[calc(100% + 12px)]",
  marginX: "[-6px]",
  marginTop: "[2px]",
  marginBottom: "[-2px]",
  paddingX: "[6px]",
  paddingY: "[2px]",
  borderRadius: "[8px]",
  borderWidth: "[0]",
  textStyle: "xs",
  lineHeight: "tight",
  color: "neutral.fg.heading",
  // The lightest step, whatever ?hover says: editing is never darker than hovering.
  backgroundColor: "neutral.s20",
  outline: "none",
});

/** The character offset under a click in the shown text, or the end when the click missed it (or it is a placeholder). */
const caretOffset = (event: React.MouseEvent<HTMLElement>, value: string) => {
  const position = event.currentTarget.ownerDocument.caretPositionFromPoint(
    event.clientX,
    event.clientY,
  );
  return position && value && event.currentTarget.contains(position.offsetNode)
    ? Math.min(position.offset, value.length)
    : value.length;
};

/**
 * Anything renamable (Aakarsh, 4 Nov, Attio's pattern): a subtle fill on hover, an input on click, Enter or blur
 * saves, Esc cancels. No pen icons anywhere.
 */
export const InlineRename = ({
  value,
  onSave,
  label,
  placeholder,
  className,
  compact = false,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  /** A line of small text (a card's description) rather than a title. */
  compact?: boolean;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  // Where the caret goes when the field opens: where the click landed in the text, else the end (Attio: no select-all).
  const [caretAt, setCaretAt] = useState<number | null>(null);
  if (draft !== null) {
    const save = () => {
      const next = draft.trim();
      if (next && next !== value) {
        onSave(next);
      }
      setDraft(null);
    };
    return (
      <input
        // `nodrag`: typing in a canvas card must not drag the card.
        className={cx(
          compact
            ? compactInputStyle
            : cx(inlineFieldStyle, renameInputStyle, inlineFieldEditingStyle),
          "nodrag",
          className,
        )}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        data-rename-input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user asked to rename; the caret goes to the name
        autoFocus
        onFocus={(event) => {
          const at = caretAt ?? event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(at, at);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            save();
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(null);
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value || placeholder || ""}. Rename`}
      className={cx(
        compact ? compactTextStyle : cx(inlineFieldStyle, renameTextStyle),
        className,
      )}
      data-rename
      data-empty={value ? undefined : true}
      onClick={(event) => {
        setCaretAt(caretOffset(event, value));
        setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setCaretAt(null);
          setDraft(value);
        }
      }}
    >
      {value || placeholder}
    </span>
  );
};

export { cx };

const toastStyle = css({
  position: "fixed",
  left: "[50%]",
  bottom: "[88px]",
  transform: "[translateX(-50%)]",
  zIndex: "[50]",
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[40px]",
  paddingLeft: "4",
  paddingRight: "1.5",
  borderRadius: "lg",
  backgroundColor: "neutral.fg.heading",
  color: "neutral.fg.onSolid",
  textStyle: "sm",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.16)]",
});

const toastActionStyle = css({
  "&[class]": { color: "neutral.fg.onSolid" },
  "&[class]:hover": { backgroundColor: "[rgba(255, 255, 255, 0.12)]" },
});

/**
 * A short confirmation at the bottom of the page ("Link copied", V7 "Published v6 · Add notes"), gone after a few
 * seconds. DS gap: ds-components has no toast; this is the smallest stand-in.
 */
export const Toast = ({
  text,
  action,
  onDone,
}: {
  text: string;
  action?: string;
  onDone: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 6000);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div className={toastStyle} role="status" data-toast>
      <Icon name="circleCheck" size="sm" />
      {text}
      {action ? (
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          className={toastActionStyle}
          onClick={onDone}
        >
          {action}
        </Button>
      ) : null}
    </div>
  );
};
