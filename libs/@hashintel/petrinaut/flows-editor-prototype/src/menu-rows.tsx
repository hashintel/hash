/**
 * Menu rows with a second line (Figma, 3 Nov): a 32 px icon tile centred across title and description, 12 px to the
 * text. In the same menu, a one-line row draws a 24 px tile with its 14 px icon, centred in a 32 px slot, so every
 * row's text lines up (J2.13 option B).
 *
 * DS gap G77: the DS Menu item's icon is an `IconName` drawn at the item size (14 px), so it cannot hold the tile.
 * The rows stay DS Menu items (keyboard, submenus, highlight) and carry this content as their `text`.
 */
import { Icon, type IconName, type ItemOrGroup, type MenuItem, Tooltip } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

/**
 * A two-line row's leading icon, outside the tiled menus: a box one 22 px title line tall that centres the icon on
 * the first line, not on the row (B′, ledger 2 Nov "Menu rows").
 */
export const firstLineIconStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  alignSelf: "flex-start",
  height: "[22px]",
});

/** A row with a second line: 8 px above and below, 6 px in; a one-line row: 6 px all round (36 px); 4 px between rows. */
export const tiledRowsStyle = css({
  "& [role=menuitem]:has([data-menu-row])": {
    "--selectable-list-item-padding-x": "6px",
    "--selectable-list-item-padding-y": "6px",
    alignItems: "center",
    borderRadius: "lg",
  },
  "& [role=menuitem]:has([data-menu-row=two])": {
    "--selectable-list-item-padding-y": "8px",
  },
  "& [role=menuitem]:has([data-menu-row]) + [role=menuitem]": {
    marginTop: "[4px]",
  },
  // The DS text column and its custom-text wrapper hug the row, so a one-line row is its 24 px slot inside (36 px in all).
  "& [role=menuitem]:has([data-menu-row]) > span:has(> span > [data-menu-row])": {
    display: "flex",
    flex: "1",
  },
  "& [role=menuitem] span:has(> [data-menu-row])": {
    display: "flex",
    flex: "1",
    minWidth: "[0]",
  },
  // A row with a hover tooltip has the tooltip's trigger between them: every wrapper still fills the row.
  "& [role=menuitem] span:has([data-menu-row])": {
    display: "flex",
    flex: "1",
    minWidth: "[0]",
  },
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minWidth: "[0]",
  width: "[100%]",
  // A two-line row hangs from the top: the tile starts at the title's cap height, as Figma draws it (3 Nov).
  "&[data-menu-row=two]": { alignItems: "flex-start" },
});

/** The 32 x 24 px slot of a one-line row: the 24 px tile centred, or nothing (Any), so the label still lines up. */
const slotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[32px]",
  height: "[24px]",
});

/** A one-line row's tile: 24 px, 6 px corners, the two-line tile's grey, a 14 px icon. */
const smallTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  borderRadius: "md",
  backgroundColor: "neutral.a25",
  color: "neutral.fg.muted",
  "& svg": { width: "[14px]", height: "[14px]", "--icon-size": "14px" },
});

/** A two-line row's 32 px column, so its text lines up with the one-line rows; the tile is centred in it. */
const tileColumnStyle = css({
  display: "flex",
  justifyContent: "center",
  flexShrink: 0,
  width: "[32px]",
});

/**
 * The tile runs from the title's cap height to the description's baseline (Figma, 3 Nov): 28 px, 1 px down, in a
 * value menu (12 px title line, 16 px description line); 30 px, 2 px down, for a step (14 px and 18 px lines).
 * 8 px corners, the step-tile grey, a 16 px icon.
 */
const tileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "lg",
    backgroundColor: "neutral.a25",
    color: "neutral.fg.muted",
    "& svg": { width: "[16px]", height: "[16px]", "--icon-size": "16px" },
  },
  variants: {
    lines: {
      value: { width: "[28px]", height: "[28px]", marginTop: "[1px]" },
      step: { width: "[30px]", height: "[30px]", marginTop: "[2px]" },
    },
  },
});

const textStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
});

const ellipsis = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const titleStyle = css({
  ...ellipsis,
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.heading",
});

/** A two-line row's title: a 12 px line in a value menu (with 1 px of room for the glyphs), 14 px for a step. */
const twoLineTitleStyle = cva({
  base: {
    ...ellipsis,
    textStyle: "sm",
    color: "neutral.fg.heading",
  },
  variants: {
    lines: {
      value: { lineHeight: "[12px]", paddingY: "[1px]", marginY: "[-1px]" },
      step: { lineHeight: "[14px]" },
    },
  },
});

/** A long line wraps, as Figma draws Send email's (J0.10), to two lines at most; the tile stays at the top. */
const descriptionStyle = cva({
  base: {
    whiteSpace: "normal",
    lineClamp: "2",
    textStyle: "xs",
    // Figma sets the line with no tracking; the DS xs style's 0.12 px clips the longest step line.
    letterSpacing: "[0]",
    fontWeight: "normal",
    color: "neutral.fg.subtle",
  },
  variants: {
    lines: {
      value: { lineHeight: "[16px]" },
      step: { lineHeight: "[18px]" },
    },
  },
});

/** How a two-line row sets its lines: a value menu's (12 / 16 px) or a step picker's (14 / 18 px). */
export type RowLines = "value" | "step";

export const MenuRow = ({
  icon,
  title,
  description,
  lines = "value",
  tint,
}: {
  icon?: IconName | React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  lines?: RowLines;
  /** `?pickercolour=` takes only: the step kind's tile colours, on the same tile at the same size. */
  tint?: React.CSSProperties;
}) => {
  const twoLine = description !== undefined && description !== null && description !== "";
  const glyph = typeof icon === "string" ? <Icon name={icon} size="sm" /> : icon;
  return (
    <span className={rowStyle} data-menu-row={twoLine ? "two" : "one"}>
      {twoLine ? (
        <span className={tileColumnStyle} aria-hidden="true">
          <span className={tileStyle({ lines })} style={tint}>
            {glyph}
          </span>
        </span>
      ) : (
        <span className={slotStyle} aria-hidden="true">
          {glyph ? (
            <span className={smallTileStyle} style={tint}>
              {glyph}
            </span>
          ) : null}
        </span>
      )}
      <span className={textStyle}>
        <span className={twoLine ? twoLineTitleStyle({ lines }) : titleStyle}>
          {title}
        </span>
        {twoLine ? (
          <span className={descriptionStyle({ lines })}>{description}</span>
        ) : null}
      </span>
    </span>
  );
};

/** A DS Menu item that may draw a glyph the DS icon set lacks (the [x] variable glyph). */
export type TiledItem = MenuItem & {
  glyph?: React.ReactElement;
  /** `?pickercolour=` takes only: see `MenuRow`. */
  tint?: React.CSSProperties;
  /** A DS tooltip right of the menu while the row is hovered (the Add step menu's description and inputs → outputs). */
  tooltip?: React.ReactNode;
};

/** The tooltip's trigger fills the row, so hovering anywhere on it opens the tooltip. */
const rowTooltipTriggerStyle = css({
  "&[class]": { display: "block", width: "[100%]", lineHeight: "[inherit]" },
});

const isGroup = <T,>(
  entry: ItemOrGroup<T>,
): entry is { id: string; label: React.ReactNode; items: T[] } =>
  typeof entry === "object" && entry !== null && "items" in entry;

const hasDescription = (item: MenuItem) =>
  item.description !== undefined && item.description !== null && item.description !== "";

/**
 * Lays out one menu level: when any of its rows has a second line, every row of that level becomes a `MenuRow` and
 * the current value is highlighted (no tick column). Each submenu is its own level.
 */
export const tileMenu = (
  entries: Array<ItemOrGroup<TiledItem>>,
  lines: RowLines = "value",
): Array<ItemOrGroup<MenuItem>> => {
  const rows = entries.flatMap((entry) => (isGroup(entry) ? entry.items : [entry]));
  const tiled = rows.some(hasDescription);
  const convert = (item: TiledItem): MenuItem => {
    const { glyph, tint, tooltip, ...rest } = item;
    const withTooltip = (row: React.ReactNode) =>
      tooltip ? (
        <Tooltip
          content={tooltip}
          position="right-start"
          gapX={20}
          className={rowTooltipTriggerStyle}
        >
          {row}
        </Tooltip>
      ) : (
        row
      );
    const subItems = rest.subItems
      ? {
          subItems: tileMenu(
            rest.subItems as Array<ItemOrGroup<TiledItem>>,
            lines,
          ),
        }
      : {};
    if (!tiled) {
      return { ...rest, ...subItems, ...(tooltip ? { text: withTooltip(rest.text) } : {}) } as MenuItem;
    }
    return {
      ...rest,
      ...subItems,
      id: rest.id ?? (typeof rest.text === "string" ? rest.text : undefined),
      text: withTooltip(
        <MenuRow
          icon={glyph ?? rest.icon}
          title={rest.text}
          description={rest.description}
          lines={lines}
          tint={tint}
        />,
      ),
      icon: undefined,
      description: undefined,
      selectedStyle: "highlight",
    } as MenuItem;
  };
  return entries.map((entry) =>
    isGroup(entry) ? { ...entry, items: entry.items.map(convert) } : convert(entry),
  );
};
