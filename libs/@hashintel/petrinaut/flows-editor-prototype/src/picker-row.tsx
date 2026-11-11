/**
 * `?pickerrow=clamp|wrap|card`: how the add-node picker's step rows show a long description. With no flag, the rows
 * are as before: the description wraps to two lines and a DS tooltip right of the menu shows it with inputs → outputs.
 *
 * - `clamp`: the description cut to one line with "…"; a cut line shows whole in a card beside the
 *   menu while its row is highlighted.
 * - `wrap`: the description wraps to two lines and the row grows; no hover card.
 * - `card`: the name only, on a one-line row; the highlighted row's card beside the menu says what it does, then
 *   "Takes: <inputs> · Gives: <outputs>" (Dora, 2 Nov call).
 *
 * The card has the figma-ds Popover look (42156:2242, Arrow=None): white, 10 px corners, the subtle border, the
 * menu's shadow.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { css } from "@hashintel/ds-helpers/css";

import { type CatalogEntry, catalog } from "./catalog";
import { stepLine } from "./step-picker";

/** Inside the app root, where the DS tokens and fonts are defined; the body has neither. */
const portalHost = () =>
  globalThis.document.querySelector(".petrinaut-root") ?? globalThis.document.body;

const take = new URLSearchParams(globalThis.location.search).get("pickerrow");

export const pickerRowTake: "clamp" | "wrap" | "card" | null =
  take === "clamp" || take === "wrap" || take === "card" ? take : null;

/** `clamp`: every step row's second line on one line, cut with "…". */
export const clampRowsStyle = css({
  "& [data-row-description]": {
    lineClamp: "1",
  },
});

const cardWidth = 240;
const cardGap = 8;

const cardStyle = css({
  position: "fixed",
  zIndex: "[2147483000]",
  width: "[240px]",
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  padding: "[12px]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "[10px]",
  boxShadow: "[0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)]",
  pointerEvents: "none",
});

const cardTextStyle = css({
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.body",
});

const cardPortsStyle = css({
  textStyle: "xs",
  lineHeight: "[16px]",
  letterSpacing: "[0]",
  color: "neutral.fg.muted",
});

const names = (ports: Array<{ label: string }>) =>
  ports.map((port) => port.label).join(", ") || "Nothing";

type Shown = { entry: CatalogEntry; left: number; top: number };

/** The step a highlighted row stands for: its item id ends in the catalog id (`recommended:queryEntities`). */
const highlighted = (onlyCut: boolean): Shown | null => {
  const item = globalThis.document.querySelector<HTMLElement>(
    '[data-scope="menu"][data-part="content"][data-state="open"] [role=menuitem][data-highlighted]',
  );
  const id = item?.getAttribute("data-value")?.split(":").pop();
  const entry = id ? catalog.find((candidate) => candidate.id === id) : undefined;
  const menu = item?.closest('[data-part="content"]');
  const line = item?.querySelector("[data-row-description]");
  // `clamp`: a card only for a line that was cut.
  const cut = !!line && line.scrollHeight > line.clientHeight + 1;
  if (!item || !entry || !menu || (onlyCut && !cut)) {
    return null;
  }
  const box = menu.getBoundingClientRect();
  // Right of the menu, or left of it where the window ends first.
  const right = box.right + cardGap;
  return {
    entry,
    left:
      right + cardWidth <= globalThis.innerWidth - cardGap
        ? right
        : box.left - cardGap - cardWidth,
    top: item.getBoundingClientRect().top,
  };
};

/** The hover card beside the menu, for the row the pointer or the keyboard is on. */
export const PickerRowCard = ({ ports }: { ports: boolean }) => {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    const update = () => setShown(highlighted(!ports));
    const observer = new MutationObserver(update);
    observer.observe(globalThis.document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-highlighted", "data-state"],
    });
    return () => observer.disconnect();
  }, [ports]);
  if (!shown) {
    return null;
  }
  const { entry, left, top } = shown;
  return createPortal(
    <div className={cardStyle} style={{ left, top }} role="tooltip">
      <span className={cardTextStyle}>
        {ports ? entry.description : stepLine(entry)}
      </span>
      {ports ? (
        <span className={cardPortsStyle}>
          Takes: {names(entry.inputs)} · Gives: {names(entry.outputs)}
        </span>
      ) : null}
    </div>,
    portalHost(),
  );
};
