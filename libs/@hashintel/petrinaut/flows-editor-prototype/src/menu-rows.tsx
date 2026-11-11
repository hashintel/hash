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
 * A two-line row's leading icon outside the tiled menus (trigger rows, output rows): the G77 tile, 32 px with an
 * 18 px icon (11 Nov), centred across both lines (Aakarsh, 9 Nov: "one big icon that spans 2 lines"). It replaces B′
 * (ledger 2 Nov), which hung a 14 px icon on the first line. The name is kept so every caller follows it.
 */
/**
 * Selected row in any single-choice menu (approved parts, 10 Nov): the label is dark Semi Bold beside the active fill,
 * as in the Steps list, so the row still reads as selected while hovered (the DS lightens a hovered selected row to
 * the hover fill). Only the label: times, counts and status words keep their weight.
 */
export const selectedLabelStyle = css({
  fontWeight: "semibold",
  color: "neutral.fg.max",
});

/** `text` as a selected row's label when `selected`, else unchanged. */
export const selectedLabel = (text: React.ReactNode, selected: boolean | undefined) =>
  selected ? <span className={selectedLabelStyle}>{text}</span> : text;

const firstLineTile = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  alignSelf: "center",
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md",
  backgroundColor: "neutral.a25",
  color: "neutral.fg.muted",
} as const;

/** A two-line row's 32 px tile with an 18 px icon (G77, 11 Nov). */
export const firstLineIconStyle = css({
  ...firstLineTile,
  "& svg": { width: "[18px]", height: "[18px]", "--icon-size": "18px" },
});

/** A panel header's 32 px tile keeps its 16 px icon. */
export const headerIconStyle = css({
  ...firstLineTile,
  "& svg": { width: "[16px]", height: "[16px]", "--icon-size": "16px" },
});

/**
 * A tile-row menu's spacing (ledger 11 Nov ~19:20, menu-spacing.png column 4): the search icon, the group label and
 * the tiles all sit 16 px in (8 px of menu, 8 px of row), 16 px on the right; a 40 px search bar; the group label
 * 8 px under the search border; a two-line row 5 px above and below (48 px in all), a one-line row 6 px; 4 px between
 * rows; 8 px after the last row. Wider than the figma-ds menu (12 px in): a recorded Flows break.
 */
export const tiledRowsStyle = css({
  "&[data-part=content]": { padding: "[8px]" },
  "& [data-menu-search]": {
    height: "[40px]",
    marginTop: "[-13px]",
    marginBottom: "[-5px]",
    marginX: "[-16px]",
    paddingX: "[16px]",
  },
  "& [data-part=item-group-label]": {
    display: "flex",
    alignItems: "center",
    height: "[28px]",
    marginTop: "[4px]",
    paddingY: "[0]",
  },
  "& [role=group]:first-child > [data-part=item-group-label]": { marginTop: "[8px]" },
  "& [role=group]:last-child": { paddingBottom: "[0]", marginBottom: "[0]" },
  "& [role=menuitem]:has([data-menu-row])": {
    "--selectable-list-item-padding-x": "8px",
    "--selectable-list-item-padding-y": "6px",
    alignItems: "center",
    borderRadius: "lg",
  },
  "& [role=menuitem]:has([data-menu-row=two])": {
    "--selectable-list-item-padding-y": "5px",
  },
  // A one-line row's 24 px tile starts on the same 16 px edge as the two-line rows' 32 px tiles (12 Nov).
  "& [data-row-slot]": { justifyContent: "flex-start" },
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

/**
 * `?srcicons=` (inbox source-menu-icons): how value menus (the @ / source menu, the later-steps menu, the entity type
 * menu) draw their leading tiles. URL only, never remembered.
 * - a (default): every row gets a 32 px tile, 6 px corners; current-item rows show their property type's icon.
 * - b: no tiles anywhere, text only, flush left.
 * - c: tiles only on rows with a second line; one-line rows flush left.
 * - old: as before (28 px tiles on two-line rows, a 24 px tile or an empty 32 px slot on one-line rows).
 */
export type SourceIconsTake = "old" | "a" | "b" | "c";

export const srcIconsTake: SourceIconsTake = (() => {
  const value = new URLSearchParams(globalThis.location.search).get("srcicons");
  return value === "old" || value === "b" || value === "c" ? value : "a";
})();

/** The tile mode a value menu's rows take: all rows, none, two-line rows only, or the old layout (undefined). */
export type TileMode = "all" | "none" | "twoLine";

export const valueTiles: TileMode | undefined =
  srcIconsTake === "old"
    ? undefined
    : srcIconsTake === "b"
      ? "none"
      : srcIconsTake === "c"
        ? "twoLine"
        : "all";

/** The value menus' tile (approved-parts G77): 32 px, 6 px corners, across both lines of a two-line row. */
const sourceTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md",
  backgroundColor: "neutral.a25",
  color: "neutral.fg.muted",
  // Centred on the row: across both lines of a two-line row.
  alignSelf: "center",
  "& svg": { width: "[16px]", height: "[16px]", "--icon-size": "16px" },
  // A two-line row's icon is 18 px (G77, 11 Nov); a one-line row keeps 16.
  "&[data-two-line] svg": { width: "[18px]", height: "[18px]", "--icon-size": "18px" },
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
 * value menu (`?srcicons=old`); 32 px (G77), 2 px down, for a step (14 px and 18 px lines).
 * 8 px corners, the step-tile grey, a 16 px icon (18 px on a step's 32 px tile).
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
      // G77: 32 px across the 38 px of lines (20 + 2 + 16), 3 px down so it is centred on them.
      step: {
        width: "[32px]",
        height: "[32px]",
        marginTop: "[3px]",
        "& svg": { width: "[18px]", height: "[18px]", "--icon-size": "18px" },
      },
    },
  },
});

/** Both lines 2 px apart (20 + 2 + 16 px, ledger 11 Nov ~19:20). */
const textStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: "[0]",
  },
  variants: {
    lines: {
      value: { gap: "[2px]" },
      step: { gap: "[2px]" },
    },
  },
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

/** A two-line row's title: a 20 px line. */
const twoLineTitleStyle = cva({
  base: {
    ...ellipsis,
    textStyle: "sm",
    color: "neutral.fg.heading",
  },
  variants: {
    lines: {
      value: { lineHeight: "[20px]" },
      step: { lineHeight: "[20px]" },
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
  },
  variants: {
    lines: {
      // #8d8d8d in a value menu (playground and Figma 770:33030).
      value: { lineHeight: "[16px]", color: "neutral.fg.muted" },
      step: { lineHeight: "[16px]", color: "neutral.fg.subtle" },
    },
  },
});

/** G77's tile for a list that lays out its own rows (the step picker takes): 32 px, an 18 px icon, across both lines. */
const ownRowTileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "md",
    backgroundColor: "neutral.a25",
    color: "neutral.fg.muted",
  },
  variants: {
    lines: {
      two: {
        width: "[32px]",
        height: "[32px]",
        "& svg": { width: "[18px]", height: "[18px]", "--icon-size": "18px" },
      },
      one: {
        width: "[24px]",
        height: "[24px]",
        "& svg": { width: "[14px]", height: "[14px]", "--icon-size": "14px" },
      },
    },
  },
});

/**
 * The leading tile of a row the caller lays out itself (approved-parts G77, "Two-line rows"): a row with a second
 * line gets a 32 px tile with an 18 px icon, centred across both lines; a one-line row gets a 24 px tile with a
 * 14 px icon, centred in a 32 px slot, so every label in the list starts at the same x. 12 px to the text.
 */
export const RowTile = ({
  icon,
  twoLine,
  tint,
}: {
  icon: IconName | React.ReactElement;
  twoLine: boolean;
  tint?: React.CSSProperties;
}) => (
  <span
    className={tileColumnStyle}
    style={{ alignSelf: "center" }}
    aria-hidden="true"
  >
    <span
      className={ownRowTileStyle({ lines: twoLine ? "two" : "one" })}
      style={tint}
    >
      {typeof icon === "string" ? <Icon name={icon} size="sm" /> : icon}
    </span>
  </span>
);

/** How a two-line row colours its second line: a value menu's (muted) or a step picker's (subtle). Both 20 / 16 px. */
export type RowLines = "value" | "step";

export const MenuRow = ({
  icon,
  title,
  description,
  lines = "value",
  tint,
  tiles,
}: {
  icon?: IconName | React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  lines?: RowLines;
  /** `?pickercolour=` takes only: the step kind's tile colours, on the same tile at the same size. */
  tint?: React.CSSProperties;
  /** A value menu's tiles (`?srcicons=`); without it, the layout from before. */
  tiles?: TileMode;
}) => {
  const twoLine = description !== undefined && description !== null && description !== "";
  const glyph = typeof icon === "string" ? <Icon name={icon} size="sm" /> : icon;
  const tiled = tiles === "all" || (tiles === "twoLine" && twoLine);
  return (
    <span
      className={rowStyle}
      data-menu-row={twoLine ? "two" : "one"}
      data-lines={lines}
    >
      {tiles ? (
        tiled ? (
          <span
            className={sourceTileStyle}
            style={tint}
            data-two-line={twoLine ? "" : undefined}
            aria-hidden="true"
          >
            {glyph}
          </span>
        ) : null
      ) : twoLine ? (
        <span className={tileColumnStyle} aria-hidden="true">
          <span className={tileStyle({ lines })} style={tint}>
            {glyph}
          </span>
        </span>
      ) : (
        <span className={slotStyle} aria-hidden="true" data-row-slot>
          {glyph ? (
            <span className={smallTileStyle} style={tint}>
              {glyph}
            </span>
          ) : null}
        </span>
      )}
      <span className={textStyle({ lines })}>
        <span className={twoLine ? twoLineTitleStyle({ lines }) : titleStyle}>
          {title}
        </span>
        {twoLine ? (
          <span className={descriptionStyle({ lines })} data-row-description>
            {description}
          </span>
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
  /** Tile every row even when none has a second line (the step picker's Browse all on its own). */
  always = false,
): Array<ItemOrGroup<MenuItem>> => {
  const rows = entries.flatMap((entry) => (isGroup(entry) ? entry.items : [entry]));
  // A value menu with `?srcicons=` a, b or c lays out every row itself, so no row falls back to the DS layout.
  const tiles = lines === "value" ? valueTiles : undefined;
  const tiled = always || tiles !== undefined || rows.some(hasDescription);
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
            always,
          ),
        }
      : {};
    const label =
      rest.selectedStyle === "highlight" || tiled ? selectedLabel(rest.text, rest.selected) : rest.text;
    if (!tiled) {
      return {
        ...rest,
        ...subItems,
        ...(tooltip || label !== rest.text ? { text: withTooltip(label) } : {}),
      } as MenuItem;
    }
    return {
      ...rest,
      ...subItems,
      id: rest.id ?? (typeof rest.text === "string" ? rest.text : undefined),
      text: withTooltip(
        <MenuRow
          // Every tile holds an icon: a row with none (a "nothing here" line) gets the info glyph.
          icon={glyph ?? rest.icon ?? (tiles === "all" ? "info" : undefined)}
          title={label}
          description={rest.description}
          lines={lines}
          tint={tint}
          tiles={tiles}
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
