/**
 * Menu rows with a second line (Figma, 3 Nov): a 32 px icon tile centred across title and description, 12 px to the
 * text. In the same menu, a one-line row keeps its 14 px icon centred in a 32 px slot, so every row's text lines up.
 *
 * DS gap G77: the DS Menu item's icon is an `IconName` drawn at the item size (14 px), so it cannot hold the tile.
 * The rows stay DS Menu items (keyboard, submenus, highlight) and carry this content as their `text`.
 */
import { Icon, type IconName, type ItemOrGroup, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/** A row with a second line: 8 px above and below, 6 px in; a one-line row: 6 px all round; 4 px between rows. */
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
  // The DS text column and its custom-text wrapper hug the row, so a one-line row is 20 px inside (32 px in all).
  "& [role=menuitem]:has([data-menu-row]) > span:has(> span > [data-menu-row])": {
    display: "flex",
    flex: "1",
  },
  "& [role=menuitem] span:has(> [data-menu-row])": {
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
});

/** The 32 px slot of a one-line row: the 14 px icon centred, or nothing (Any). */
const slotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[32px]",
  height: "[20px]",
  color: "neutral.fg.muted",
  "& svg": { width: "[14px]", height: "[14px]", "--icon-size": "14px" },
});

/** The 32 px tile: 8 px corners, the step-tile grey, a 16 px icon. */
const tileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[32px]",
  height: "[32px]",
  borderRadius: "lg",
  backgroundColor: "neutral.a25",
  color: "neutral.fg.muted",
  "& svg": { width: "[16px]", height: "[16px]", "--icon-size": "16px" },
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

/** In a two-line row Figma sets the title on a 12 px line, so title, 4 px and description fill the 32 px tile. */
const twoLineTitleStyle = css({
  ...ellipsis,
  textStyle: "sm",
  lineHeight: "[12px]",
  paddingY: "[1px]",
  marginY: "[-1px]",
  color: "neutral.fg.heading",
});

/** A long line wraps, as Figma draws Send email's (J0.10); the tile stays centred on the row. */
const descriptionStyle = css({
  whiteSpace: "normal",
  textStyle: "xs",
  lineHeight: "[16px]",
  // Figma sets the line with no tracking; the DS xs style's 0.12 px clips the longest step line.
  letterSpacing: "[0]",
  fontWeight: "normal",
  color: "neutral.fg.subtle",
});

export const MenuRow = ({
  icon,
  title,
  description,
}: {
  icon?: IconName | React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
}) => {
  const twoLine = description !== undefined && description !== null && description !== "";
  const glyph = typeof icon === "string" ? <Icon name={icon} size="sm" /> : icon;
  return (
    <span className={rowStyle} data-menu-row={twoLine ? "two" : "one"}>
      <span className={twoLine ? tileStyle : slotStyle} aria-hidden="true">
        {glyph}
      </span>
      <span className={textStyle}>
        <span className={twoLine ? twoLineTitleStyle : titleStyle}>
          {title}
        </span>
        {twoLine ? <span className={descriptionStyle}>{description}</span> : null}
      </span>
    </span>
  );
};

/** A DS Menu item that may draw a glyph the DS icon set lacks (the [x] variable glyph). */
export type TiledItem = MenuItem & { glyph?: React.ReactElement };

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
): Array<ItemOrGroup<MenuItem>> => {
  const rows = entries.flatMap((entry) => (isGroup(entry) ? entry.items : [entry]));
  const tiled = rows.some(hasDescription);
  const convert = (item: TiledItem): MenuItem => {
    const { glyph, ...rest } = item;
    const subItems = rest.subItems
      ? { subItems: tileMenu(rest.subItems as Array<ItemOrGroup<TiledItem>>) }
      : {};
    if (!tiled) {
      return { ...rest, ...subItems } as MenuItem;
    }
    return {
      ...rest,
      ...subItems,
      id: rest.id ?? (typeof rest.text === "string" ? rest.text : undefined),
      text: (
        <MenuRow icon={glyph ?? rest.icon} title={rest.text} description={rest.description} />
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
