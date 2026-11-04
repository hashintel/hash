import { use } from "react";

import { Button, Menu, Toggle, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { usePlacePropertiesContext } from "../../context";
import {
  addTerm,
  composableEquations,
  describeEquationForm,
  moveTerm,
  removeTerm,
} from "./compose-dynamics";

import type { SubView } from "../../../../../../../components/sub-view/types";
import type { PlaceDynamicsTerm } from "@hashintel/petrinaut-core";

const hintStyle = css({
  fontSize: "[12px]",
  color: "neutral.s95",
  paddingY: "2",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  listStyle: "none",
  margin: "0",
  padding: "0",
  paddingY: "1",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingY: "1",
  minHeight: "[28px]",
});

const nameStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  fontSize: "sm",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const formStyle = css({
  fontSize: "[11px]",
  color: "neutral.s90",
  whiteSpace: "nowrap",
});

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
});

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

/**
 * The equations composed into the selected place's dynamics, in the order
 * they are applied; their derivatives are summed every step.
 */
const PlaceDynamicsContent: React.FC = () => {
  const { place, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const {
    activeNet: { differentialEquations },
  } = use(ActiveNetContext);
  const { selectItem } = use(EditorContext);
  const terms = place.dynamics ?? [];

  const setTerms = (dynamics: PlaceDynamicsTerm[]) =>
    updatePlace({ placeId: place.id, update: { dynamics } });

  if (place.colorId === null) {
    return (
      <div className={hintStyle}>{UI_MESSAGES.DYNAMICS_REQUIRES_TYPE}</div>
    );
  }
  if (terms.length === 0) {
    return (
      <div className={hintStyle}>
        No equations yet. Add one of this type&apos;s equations with the +
        button; the derivatives of every equation listed here are summed.
      </div>
    );
  }

  // The editor adds an equation once, but a file may repeat one; a repeat
  // is keyed by how many times its equation already appeared above it.
  const occurrences = new Map<string, number>();
  const keys = terms.map((term) => {
    const seen = occurrences.get(term.differentialEquationId) ?? 0;
    occurrences.set(term.differentialEquationId, seen + 1);
    return `${term.differentialEquationId}#${seen}`;
  });

  return (
    <>
      {place.dynamicsEnabled ? null : (
        <div className={hintStyle}>
          Dynamics are switched off: these equations are kept but not
          integrated.
        </div>
      )}
      <ol className={listStyle} aria-label="Composed equations">
        {terms.map((term, index) => {
          const equation = differentialEquations.find(
            (candidate) => candidate.id === term.differentialEquationId,
          );
          const name = equation?.name ?? term.differentialEquationId;
          return (
            <li key={keys[index]} className={rowStyle}>
              <span className={nameStyle} title={name}>
                {name}
              </span>
              <span className={formStyle}>
                {equation ? describeEquationForm(equation) : "Missing equation"}
              </span>
              <div className={actionsStyle}>
                <Button
                  aria-label={`Move ${name} up`}
                  tooltip="Move up"
                  variant="ghost"
                  tone="neutral"
                  size="xs"
                  iconName="arrowUp"
                  disabled={isReadOnly || index === 0}
                  onClick={() => setTerms(moveTerm(terms, index, -1))}
                />
                <Button
                  aria-label={`Move ${name} down`}
                  tooltip="Move down"
                  variant="ghost"
                  tone="neutral"
                  size="xs"
                  iconName="arrowDown"
                  disabled={isReadOnly || index === terms.length - 1}
                  onClick={() => setTerms(moveTerm(terms, index, 1))}
                />
                <Button
                  aria-label={`View ${name}`}
                  tooltip="View equation"
                  variant="ghost"
                  tone="neutral"
                  size="xs"
                  iconName="arrowRight"
                  disabled={equation === undefined}
                  onClick={() =>
                    selectItem({
                      type: "differentialEquation",
                      id: term.differentialEquationId,
                    })
                  }
                />
                <Button
                  aria-label={`Remove ${name}`}
                  tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Remove"}
                  variant="ghost"
                  tone="error"
                  size="xs"
                  iconName="trash"
                  disabled={isReadOnly}
                  onClick={() => setTerms(removeTerm(terms, index))}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
};

/**
 * The header's controls: the switch that runs the place's equations and the
 * + menu with one entry per equation of the colour not yet composed.
 */
const PlaceDynamicsHeaderActions: React.FC = () => {
  const { place, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const {
    activeNet: { differentialEquations },
  } = use(ActiveNetContext);
  const candidates = composableEquations(place, differentialEquations);
  const untyped = place.colorId === null;
  const toggleTooltip = isReadOnly
    ? UI_MESSAGES.READ_ONLY_MODE
    : untyped
      ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
      : undefined;
  const addTooltip = isReadOnly
    ? UI_MESSAGES.READ_ONLY_MODE
    : untyped
      ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
      : candidates.length === 0
        ? "Every equation of this type is already composed"
        : "Add an equation";

  return (
    <div className={headerActionsStyle}>
      <Tooltip content={toggleTooltip} disableTooltip={!toggleTooltip}>
        <Toggle
          aria-label="Dynamics enabled"
          size="sm"
          tone="success"
          value={!untyped && place.dynamicsEnabled}
          disabled={isReadOnly || untyped}
          onChange={(dynamicsEnabled) =>
            updatePlace({ placeId: place.id, update: { dynamicsEnabled } })
          }
        />
      </Tooltip>
      <Menu
        trigger={
          <Button
            aria-label="Add equation"
            tooltip={addTooltip}
            variant="ghost"
            size="xs"
            iconName="plus"
            disabled={isReadOnly || candidates.length === 0}
          />
        }
        items={candidates.map((equation) => ({
          id: equation.id,
          text: `${equation.name} · ${describeEquationForm(equation)}`,
          onClick: () =>
            updatePlace({
              placeId: place.id,
              update: { dynamics: addTerm(place.dynamics ?? [], equation.id) },
            }),
        }))}
      />
    </div>
  );
};

/**
 * SubView definition for a place's dynamics. Requires
 * PlacePropertiesProvider in the component tree.
 */
export const placeDynamicsSubView: SubView = {
  id: "place-dynamics",
  title: "Dynamics",
  tooltip:
    "The differential equations that move this place's tokens while it holds them, applied in order with their derivatives summed. An equation over several tokens is applied to every combination of that many tokens.",
  component: PlaceDynamicsContent,
  renderHeaderAction: () => <PlaceDynamicsHeaderActions />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};
