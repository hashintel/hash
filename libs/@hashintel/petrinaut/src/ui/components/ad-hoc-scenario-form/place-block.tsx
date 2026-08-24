/**
 * One place's section of the ad-hoc form: a header carrying the place name
 * and an icon-only Add-variable button; the per-place Variables block (hidden
 * while empty); and the token spreadsheet (coloured places). An uncoloured
 * place is one line: its name and its count slot.
 */

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { adHocTargetLabel } from "@hashintel/petrinaut-core";

import { TokenTable } from "./token-table";
import { ValueEditor } from "./value-editor";
import { VariableRows } from "./variable-rows";

import type {
  AdHocColouredPlace,
  AdHocScenarioState,
  AdHocSynthesisContext,
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
  optimizable: boolean;
  formState: AdHocScenarioState;
  context: AdHocSynthesisContext;
}

export const ColouredPlaceBlock: React.FC<ColouredPlaceBlockProps> = ({
  place,
  colour,
  state,
  onChange,
  optimizable,
  formState,
  context,
}) => (
  <div className={blockStyle}>
    <div className={headerStyle}>
      <span className={placeNameStyle}>{place.name}</span>
      <span className={headerSpacerStyle} />
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
                name: nextVariableName(state.variables.map((it) => it.name)),
                type: "real",
                expression: "0",
                optimize: null,
              },
            ],
          })
        }
      />
    </div>
    <VariableRows
      scopeLabel={`Variables of ${place.name}`}
      placeId={place.id}
      variables={state.variables}
      onChange={(variables) => onChange({ ...state, variables })}
      optimizable={optimizable}
      formState={formState}
      context={context}
    />
    <TokenTable
      place={place}
      colour={colour}
      state={state}
      onChange={onChange}
      optimizable={optimizable}
      formState={formState}
      context={context}
    />
  </div>
);

export interface UncolouredPlaceBlockProps {
  place: Place;
  state: AdHocUncolouredPlace;
  onChange: (place: AdHocUncolouredPlace) => void;
  optimizable: boolean;
  formState: AdHocScenarioState;
  context: AdHocSynthesisContext;
}

export const UncolouredPlaceBlock: React.FC<UncolouredPlaceBlockProps> = ({
  place,
  state,
  onChange,
  optimizable,
  formState,
  context,
}) => {
  const target = { kind: "count" as const, placeId: place.id, row: null };
  return (
    <div className={headerStyle}>
      <span className={placeNameStyle}>{place.name}</span>
      <div className={inlineCountStyle}>
        <span>×</span>
        <ValueEditor
          value={state.count}
          target={target}
          label={adHocTargetLabel(target, formState, context)}
          optimizable={optimizable}
          integer
          withStep={false}
          className={inlineCountEditorStyle}
          onChange={(count) => onChange({ ...state, count })}
        />
      </div>
    </div>
  );
};
