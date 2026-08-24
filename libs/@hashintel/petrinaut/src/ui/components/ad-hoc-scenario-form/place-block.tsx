/**
 * One place's section of the ad-hoc form: a header carrying the place name
 * (a collapse toggle, keyboard-navigable: Left collapses, Right expands) and
 * an icon-only Add-variable button; the per-place Variables block (hidden
 * while empty); and the token spreadsheet (coloured places). Collapsed, the
 * place is one line: its name and a summary of its rows and token total. An
 * uncoloured place is always one line: its name and its count slot.
 */

import { use, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { resolveAdHocPlaceTotal } from "@hashintel/petrinaut-core";

import { AdHocFormContext } from "./form-context";
import { TokenTable } from "./token-table";
import {
  focusLands,
  useNavigationHeader,
  useNavigationZone,
} from "./use-form-navigation";
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

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const placeNameButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  border: "none",
  background: "[transparent]",
  padding: "[2px 4px]",
  marginLeft: "[-4px]",
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

const summaryStyle = css({
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
});

const placeNameStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const headerSpacerStyle = css({
  flex: "1",
});

const inlineCountStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s80",
});

const inlineCountEditorStyle = css({
  minWidth: "[64px]",
  width: "auto",
  borderRadius: "xs",
});

/** A fresh variable name no sibling already uses. */
function nextVariableName(existing: string[]): string {
  const names = new Set(existing);
  let ordinal = 1;
  while (names.has(`variable${ordinal}`)) {
    ordinal += 1;
  }
  return `variable${ordinal}`;
}

export interface ColouredPlaceBlockProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
  onChange: (place: AdHocColouredPlace) => void;
}

export const ColouredPlaceBlock: React.FC<ColouredPlaceBlockProps> = ({
  place,
  colour,
  state,
  onChange,
}) => {
  const { formState, synthesisContext } = use(AdHocFormContext);
  const [collapsed, setCollapsed] = useState(false);
  const { attach: attachHeader, onHeaderKeyDown } = useNavigationHeader({
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  });
  const total = resolveAdHocPlaceTotal(formState, synthesisContext, place.id);
  const totalText = total.resolved ? `${total.total}` : total.text;

  return (
    <div className={blockStyle}>
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
          {place.name}
        </button>
        {collapsed ? (
          <span className={summaryStyle}>
            {state.rows.length} row{state.rows.length === 1 ? "" : "s"} · ={" "}
            {totalText} tokens
          </span>
        ) : null}
        <span className={headerSpacerStyle} />
        {collapsed ? null : (
          <Button
            size="xs"
            variant="ghost"
            tone="neutral"
            iconName="plus"
            aria-label={`Add a variable to ${place.name}`}
            tooltip="Add a variable scoped to this place's rows"
            onClick={() =>
              onChange({
                ...state,
                variables: [
                  ...state.variables,
                  {
                    name: nextVariableName(
                      state.variables.map((it) => it.name),
                    ),
                    type: "real",
                    expression: "0",
                    optimize: null,
                  },
                ],
              })
            }
          />
        )}
      </div>
      {collapsed ? null : (
        <>
          <VariableRows
            scopeLabel={`Variables of ${place.name}`}
            placeId={place.id}
            variables={state.variables}
            onChange={(variables) => onChange({ ...state, variables })}
          />
          <TokenTable
            place={place}
            colour={colour}
            state={state}
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
};

export interface UncolouredPlaceBlockProps {
  place: Place;
  state: AdHocUncolouredPlace;
  onChange: (place: AdHocUncolouredPlace) => void;
}

export const UncolouredPlaceBlock: React.FC<UncolouredPlaceBlockProps> = ({
  place,
  state,
  onChange,
}) => {
  const target = { kind: "count" as const, placeId: place.id, row: null };
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { attach: attachZone, exit: exitZone } = useNavigationZone(() =>
    focusLands(trigger),
  );

  return (
    <div ref={attachZone} className={headerStyle}>
      <span className={placeNameStyle}>{place.name}</span>
      <div className={inlineCountStyle}>
        <span>×</span>
        <ValueEditor
          value={state.count}
          target={target}
          integer
          withStep={false}
          className={inlineCountEditorStyle}
          triggerRef={setTrigger}
          onTriggerKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              exitZone(event.key === "ArrowUp" ? "previous" : "next");
            }
          }}
          onChange={(count) => onChange({ ...state, count })}
        />
      </div>
    </div>
  );
};
