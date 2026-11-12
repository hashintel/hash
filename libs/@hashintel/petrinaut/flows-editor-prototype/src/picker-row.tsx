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

import { Icon, type IconName } from "@hashintel/ds-components";
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

/* ----------------------------------------------------------------------------------------------------------------
 * H2 "Fit in this flow" (inbox picker-row-all-two-line, hover-fit, 13 Nov; its content is to be discussed on the 13 Nov
 * call): the light card beside the menu says what comes before the hovered step here and where its list can go.
 * `?pickerhover=old` keeps the dark tooltip with the description and inputs → outputs.
 * ------------------------------------------------------------------------------------------------------------- */

export const pickerHoverOld =
  new URLSearchParams(globalThis.location.search).get("pickerhover") === "old";

/** About the menu's own width, so the two-line rows break as the menu's do. */
const fitCardWidth = 300;

const fitCardStyle = css({
  position: "fixed",
  zIndex: "[2147483000]",
  width: "[300px]",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "[10px]",
  boxShadow: "[0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)]",
  pointerEvents: "none",
});

const fitHeadStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  textStyle: "xs",
  fontWeight: "medium",
  letterSpacing: "[0.12px]",
  textTransform: "uppercase",
  color: "neutral.fg.subtle",
});

const fitRowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "3",
  paddingX: "2",
  paddingY: "1.5",
});

const fitTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  // The menu's two-line row tile (G77): 32 px with an 18 px icon.
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md",
  "& svg": { width: "[18px !important]", height: "[18px !important]" },
});

const fitNameStyle = css({ display: "block", textStyle: "sm", lineHeight: "[20px]", color: "neutral.fg.heading" });
const fitLineStyle = css({ display: "block", textStyle: "xs", lineHeight: "[16px]", color: "neutral.fg.subtle" });

export type FitRow = { icon: IconName; tile: React.CSSProperties; name: string; line: string };
export type Fit = { before?: FitRow; next: FitRow[]; nextLabel: string };

type FitShown = { fit: Fit; left: number; top: number };

/** Left of the menu, top-aligned with the row (8 px gap), or right of it where the window ends first. */
const fitPlace = (fitOf: (entry: CatalogEntry) => Fit | null): FitShown | null => {
  const item = globalThis.document.querySelector<HTMLElement>(
    '[data-scope="menu"][data-part="content"][data-state="open"] [role=menuitem][data-highlighted]',
  );
  const id = item?.getAttribute("data-value")?.split(":").pop();
  const entry = id ? catalog.find((candidate) => candidate.id === id) : undefined;
  const menu = item?.closest('[data-part="content"]');
  const fit = entry ? fitOf(entry) : null;
  if (!item || !menu || !fit) {
    return null;
  }
  const box = menu.getBoundingClientRect();
  const left = box.left - cardGap - fitCardWidth;
  return {
    fit,
    left: left >= cardGap ? left : box.right + cardGap,
    top: item.getBoundingClientRect().top,
  };
};

const FitRowView = ({ row }: { row: FitRow }) => (
  <div className={fitRowStyle}>
    <span className={fitTileStyle} style={row.tile} aria-hidden>
      <Icon name={row.icon} size="sm" />
    </span>
    <span className={css({ minWidth: "[0]" })}>
      <span className={fitNameStyle}>{row.name}</span>
      <span className={fitLineStyle}>{row.line}</span>
    </span>
  </div>
);

export const PickerFitCard = ({ fitOf }: { fitOf: (entry: CatalogEntry) => Fit | null }) => {
  const [shown, setShown] = useState<FitShown | null>(null);
  useEffect(() => {
    const update = () => setShown(fitPlace(fitOf));
    const observer = new MutationObserver(update);
    observer.observe(globalThis.document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-highlighted", "data-state"],
    });
    return () => observer.disconnect();
  }, [fitOf]);
  if (!shown) {
    return null;
  }
  const { fit, left, top } = shown;
  return createPortal(
    <div className={fitCardStyle} style={{ left, top }} role="tooltip" data-picker-fit>
      {fit.before ? (
        <>
          <span className={fitHeadStyle}>Before it</span>
          <FitRowView row={fit.before} />
        </>
      ) : null}
      {fit.next.length > 0 ? (
        <>
          <span className={fitHeadStyle}>{fit.nextLabel}</span>
          {fit.next.map((row) => (
            <FitRowView key={row.name} row={row} />
          ))}
        </>
      ) : null}
    </div>,
    portalHost(),
  );
};
