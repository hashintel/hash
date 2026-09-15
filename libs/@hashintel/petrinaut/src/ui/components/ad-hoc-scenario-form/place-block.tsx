/**
 * One place's section of the ad-hoc form: a header carrying the place's
 * token colour and name (for coloured places a collapse toggle,
 * keyboard-navigable: Left collapses, Right expands), the per-place
 * Variables block, and the token spreadsheet. Collapsing animates with a
 * grid-track transition and makes the content inert; collapsed, the place
 * is one line: its name and a summary of its rows and token total. An
 * uncoloured place is a header plus one full-width count cell.
 */

import { use, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useFocusHeader } from "../../worksheet/use-focus-member";
import { AdHocFormContext } from "./form-context";
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
  "&[data-collapsed]": { gap: "0" },
});

const denseBlockStyle = css({
  gap: "1",
});

// One line grammar for places: the fixed title width and line height are
// shared between an uncoloured place's row and a collapsed coloured
// place's header, so counts and collapsed summaries start at the same x.
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[26px]",
});

const placeNameButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  border: "none",
  background: "[transparent]",
  padding: "[2px 4px]",
  marginLeft: "[-24px]",
  minWidth: "[0]",
  borderRadius: "xs",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.s10" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const collapsedTitleButtonStyle = css({
  width: "[214px]",
  flexShrink: "0",
});

const collapsedTitleNameStyle = css({
  flex: "1",
  minWidth: "[0]",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  maskImage:
    "[linear-gradient(to right, black calc(100% - 14px), transparent)]",
});

const chevronStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s100",
  width: "[12px]",
  flexShrink: "0",
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
  whiteSpace: "nowrap",
});

// A place that actually holds tokens must be pickable out of the list at a
// glance: its summary reads in full ink, empty places stay quiet.
const summaryFilledStyle = css({
  color: "neutral.s110",
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
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
});

const headerSpacerStyle = css({
  flex: "1",
});

// An uncoloured place is one line: a fixed-width title, then the count
// cell filling the rest in the same bordered shell as the spreadsheets.
// Every uncoloured place's count starts at the same x; a long name fades
// out under a mask instead of pushing the cell.
const uncolouredRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[26px]",
});

// A count line reads lighter than a 28px spreadsheet row.
const uncolouredCountTriggerStyle = css({
  height: "[24px!]",
  minHeight: "[24px!]",
});

const uncolouredTitleStyle = css({
  marginLeft: "[-4px]",
  width: "[194px]",
  flexShrink: "0",
  overflow: "hidden",
  whiteSpace: "nowrap",
  maskImage:
    "[linear-gradient(to right, black calc(100% - 14px), transparent)]",
});

const countBoxStyle = css({
  display: "flex",
  flex: "1",
  minWidth: "[0]",
});

export interface ColouredPlaceBlockProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
}

/**
 * The expanded body of a coloured place — split out so a collapsed place
 * mounts none of it.
 */
const PlaceBlockContents: React.FC<ColouredPlaceBlockProps> = ({
  place,
  colour,
  state,
}) => {
  const { mode } = use(AdHocFormContext);
  return (
    <>
      {/* Run mode shows no auxiliary Variables — they are the saved
          definition's internals, not something a run adjusts. */}
      {mode === "run" ? null : (
        <VariableRows
          scopeLabel={`Variables of ${place.name}`}
          placeId={place.id}
          variables={state.variables}
        />
      )}
      <TokenTable place={place} colour={colour} state={state} />
    </>
  );
};

export const ColouredPlaceBlock: React.FC<ColouredPlaceBlockProps> = ({
  place,
  colour,
  state,
}) => {
  const { placeTotal, dense } = use(AdHocFormContext);
  // The dense embedding (quick simulation) starts places collapsed: the
  // panel reads as an overview, one line per place.
  const [collapsed, setCollapsed] = useState(dense);
  // The tables mount on first expand and stay mounted after (the collapse
  // animation needs live content), so a never-opened place costs one line
  // of DOM instead of a whole spreadsheet.
  const [everExpanded, setEverExpanded] = useState(!dense);
  if (!collapsed && !everExpanded) {
    setEverExpanded(true);
  }
  const { attach: attachHeader, onHeaderKeyDown } = useFocusHeader({
    collapse: collapsed ? undefined : () => setCollapsed(true),
    expand: collapsed ? () => setCollapsed(false) : undefined,
  });
  const total = placeTotal(place.id);
  const totalText = total.resolved ? `${total.total}` : total.text;

  return (
    <div
      className={cx(blockStyle, dense && denseBlockStyle)}
      data-collapsed={collapsed || undefined}
    >
      <div className={headerStyle}>
        <button
          ref={attachHeader}
          type="button"
          className={cx(
            placeNameButtonStyle,
            collapsed && collapsedTitleButtonStyle,
          )}
          aria-expanded={!collapsed}
          aria-label={`${place.name} place`}
          onClick={() => setCollapsed((current) => !current)}
          onKeyDown={onHeaderKeyDown}
        >
          <span
            aria-hidden="true"
            className={cx(chevronStyle, collapsed && collapsedChevronStyle)}
          >
            <Icon name="chevronDown" size="xxs" />
          </span>
          <span
            aria-hidden="true"
            className={colourDotStyle}
            style={{ backgroundColor: colour.displayColor }}
          />
          <span className={cx(collapsed && collapsedTitleNameStyle)}>
            {place.name}
          </span>
        </button>
        {collapsed ? (
          <span
            className={cx(
              summaryStyle,
              (state.rows.length > 0 || (total.resolved && total.total > 0)) &&
                summaryFilledStyle,
            )}
          >
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
          {everExpanded ? (
            <PlaceBlockContents place={place} colour={colour} state={state} />
          ) : null}
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
  const { mode } = use(AdHocFormContext);
  const target = { kind: "count" as const, placeId: place.id, row: null };
  // The count cell is a single-element member: vertical arrows leave to the
  // neighbouring member, horizontal ones cross into a sibling column.
  const { attach: attachTrigger, onHeaderKeyDown } = useFocusHeader({});

  return (
    <div className={uncolouredRowStyle}>
      <span className={cx(placeNameStyle, uncolouredTitleStyle)}>
        <span
          aria-hidden="true"
          className={colourDotStyle}
          style={{ backgroundColor: "#ccc" }}
        />
        <span>{place.name}</span>
      </span>
      <div className={cx(tableContainerStyle, countBoxStyle)}>
        <ValueEditor
          value={state.count}
          target={target}
          kind="count"
          readOnly={mode === "run"}
          placeholder="0 tokens"
          className={uncolouredCountTriggerStyle}
          triggerRef={attachTrigger}
          onTriggerKeyDown={onHeaderKeyDown}
        />
      </div>
    </div>
  );
};
