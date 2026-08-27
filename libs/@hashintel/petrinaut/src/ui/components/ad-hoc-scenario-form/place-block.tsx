/**
 * One place's section of the ad-hoc form: a header carrying the place's
 * token colour and name (for coloured places a collapse toggle,
 * keyboard-navigable: Left collapses, Right expands), the per-place
 * Variables block, and the token spreadsheet. Collapsing animates with a
 * grid-track transition and makes the content inert; collapsed, the place
 * is one line: its name and a summary of its rows and token total. An
 * uncoloured place is a header plus one full-width count cell.
 *
 * The collapse chevron hangs in the left margin, so every place name —
 * coloured or not — starts at the same x as the blocks beneath it.
 */

import { use, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";
import { resolveAdHocPlaceTotal } from "@hashintel/petrinaut-core";

import { AdHocFormContext } from "./form-context";
import {
  focusLands,
  useNavigationHeader,
  useNavigationZone,
} from "./navigation/use-form-navigation";
import { tableContainerStyle } from "./spreadsheet/form-table";
import { TokenTable } from "./token-table";
import { ValueEditor } from "./value-editor";
import { VariableRows } from "./variable-rows";

import type {
  AdHocColouredPlace,
  AdHocUncolouredPlace,
  Color,
  Place,
} from "@hashintel/petrinaut-core";

const blockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const denseBlockStyle = css({
  gap: "1",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

// The place-name trigger pulls itself left by its padding plus the chevron
// slot, so the dot + name align with the un-chevroned headers and the
// tables below.
const placeNameButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  border: "none",
  background: "[transparent]",
  padding: "[2px 4px]",
  marginLeft: "[-18px]",
  borderRadius: "xs",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.s10" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const chevronStyle = css({
  fontSize: "[9px]",
  color: "neutral.s70",
  width: "[10px]",
  transition: "[transform 0.12s ease]",
});

const collapsedChevronStyle = css({
  transform: "[rotate(-90deg)]",
});

/** The token colour, the same dot the classical scenario form shows. */
const colourDotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  flexShrink: "0",
});

const summaryStyle = css({
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
});

// Collapse with pure CSS: the wrapper is a one-row grid whose track
// animates 1fr -> 0fr; the inner clips. `inert` removes the collapsed
// content from focus and the accessibility tree, so the keyboard walk
// skips it.
const collapseWrapStyle = css({
  display: "grid",
  gridTemplateRows: "[1fr]",
  transition: "[grid-template-rows 0.2s ease]",
  "&[data-collapsed]": {
    gridTemplateRows: "[0fr]",
  },
});

const collapseInnerStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const placeNameStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "[2px 0]",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});

// The embedded (dense) rendering shrinks the titles a step and tightens
// their padding, so a long place list stays scannable in a panel.
const densePlaceNameStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
});

const headerSpacerStyle = css({
  flex: "1",
});

// An uncoloured place's count is one full-width cell in the same bordered
// shell as the spreadsheets, so it reads as part of the same grammar
// instead of an inline aside.
const countBoxStyle = css({
  display: "flex",
});

export interface ColouredPlaceBlockProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
}

export const ColouredPlaceBlock: React.FC<ColouredPlaceBlockProps> = ({
  place,
  colour,
  state,
}) => {
  const { formState, synthesisContext, dense } = use(AdHocFormContext);
  const [collapsed, setCollapsed] = useState(false);
  const { attach: attachHeader, onHeaderKeyDown } = useNavigationHeader({
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  });
  const total = resolveAdHocPlaceTotal(formState, synthesisContext, place.id);
  const totalText = total.resolved ? `${total.total}` : total.text;

  return (
    <div className={cx(blockStyle, dense && denseBlockStyle)}>
      <div className={headerStyle}>
        <button
          ref={attachHeader}
          type="button"
          className={placeNameButtonStyle}
          aria-expanded={!collapsed}
          aria-label={`${place.name} place`}
          onClick={() => setCollapsed((current) => !current)}
          onKeyDown={onHeaderKeyDown}
        >
          <span
            aria-hidden="true"
            className={cx(chevronStyle, collapsed && collapsedChevronStyle)}
          >
            ▼
          </span>
          <span
            aria-hidden="true"
            className={colourDotStyle}
            style={{ backgroundColor: colour.displayColor }}
          />
          <span className={cx(dense && densePlaceNameStyle)}>{place.name}</span>
        </button>
        {collapsed ? (
          <span className={summaryStyle}>
            {state.rows.length} row{state.rows.length === 1 ? "" : "s"} ·{" "}
            {totalText} tokens
          </span>
        ) : null}
        <span className={headerSpacerStyle} />
      </div>
      <div
        className={collapseWrapStyle}
        data-collapsed={collapsed || undefined}
      >
        <div className={collapseInnerStyle} inert={collapsed}>
          <VariableRows
            scopeLabel={`Variables of ${place.name}`}
            placeId={place.id}
            variables={state.variables}
          />
          <TokenTable place={place} colour={colour} state={state} />
        </div>
      </div>
    </div>
  );
};

export interface UncolouredPlaceBlockProps {
  place: Place;
  state: AdHocUncolouredPlace;
}

export const UncolouredPlaceBlock: React.FC<UncolouredPlaceBlockProps> = ({
  place,
  state,
}) => {
  const { dense } = use(AdHocFormContext);
  const target = { kind: "count" as const, placeId: place.id, row: null };
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { attach: attachZone, exit: exitZone } = useNavigationZone(() =>
    focusLands(trigger),
  );

  return (
    <div ref={attachZone} className={cx(blockStyle, dense && denseBlockStyle)}>
      <div className={headerStyle}>
        <span className={placeNameStyle}>
          <span
            aria-hidden="true"
            className={colourDotStyle}
            style={{ backgroundColor: "#ccc" }}
          />
          <span className={cx(dense && densePlaceNameStyle)}>{place.name}</span>
        </span>
      </div>
      <div className={cx(tableContainerStyle, countBoxStyle)}>
        <ValueEditor
          value={state.count}
          target={target}
          integer
          withStep={false}
          placeholder="0 tokens"
          triggerRef={setTrigger}
          onTriggerKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              exitZone(event.key === "ArrowUp" ? "previous" : "next");
            }
          }}
        />
      </div>
    </div>
  );
};
