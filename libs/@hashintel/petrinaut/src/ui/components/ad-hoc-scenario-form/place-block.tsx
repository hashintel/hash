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

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { resolveAdHocPlaceTotal } from "@hashintel/petrinaut-core";

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
  contentVisibility: "auto",
  containIntrinsicSize: "[auto 200px]",
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
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
  marginLeft: "[-20px]",
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

// Collapsed, the title button takes the shared fixed width (the 20px
// chevron hang included), so the summary aligns with the uncoloured
// places' count cells.
const collapsedTitleButtonStyle = css({
  width: "[190px]",
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
  color: "neutral.s70",
  width: "[12px]",
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
  width: "[170px]",
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
  const { formState, synthesisContext, dense } = use(AdHocFormContext);
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
          <span
            className={cx(
              dense && densePlaceNameStyle,
              collapsed && collapsedTitleNameStyle,
            )}
          >
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
  const { mode, dense } = use(AdHocFormContext);
  const target = { kind: "count" as const, placeId: place.id, row: null };
  // The count cell is a single-element member: vertical arrows leave to the
  // neighbouring member, horizontal ones cross into a sibling column.
  const { attach: attachTrigger, onHeaderKeyDown } = useFocusHeader({});

  return (
    <div className={uncolouredRowStyle}>
      <span
        className={cx(
          placeNameStyle,
          uncolouredTitleStyle,
          dense && densePlaceNameStyle,
        )}
      >
        <span
          aria-hidden="true"
          className={colourDotStyle}
          style={{ backgroundColor: "#ccc" }}
        />
        <span className={cx(dense && densePlaceNameStyle)}>{place.name}</span>
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
