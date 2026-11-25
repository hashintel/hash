import {
  getPlaceDynamicsEquationIds,
  placeUsesDifferentialEquation,
} from "@hashintel/petrinaut-core";

import {
  placeName,
  transitionInputPlaceIds,
  transitionOutputPlaceIds,
} from "../notebook-model";

import type { ActiveNetDefinition } from "../../../../react/document/active-net-context";
import type { NotebookCell } from "../notebook-model";
import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

const typeName = (net: ActiveNetDefinition, colorId: string | null): string => {
  if (colorId === null) {
    return "untyped";
  }
  const color = net.types.find(({ id }) => id === colorId);
  return color?.name ?? colorId;
};

const placeSummary = (net: ActiveNetDefinition, place: Place): string => {
  const parts = [typeName(net, place.colorId)];
  const equationIds = place.dynamicsEnabled
    ? getPlaceDynamicsEquationIds(place)
    : [];
  if (equationIds.length > 0) {
    const names = equationIds.map(
      (equationId) =>
        net.differentialEquations.find(({ id }) => id === equationId)?.name ??
        equationId,
    );
    parts.push(`d/dt: ${names.join(" + ")}`);
  }
  if (place.isPort) {
    parts.push("port");
  }
  return parts.join(" · ");
};

const transitionSummary = (
  net: ActiveNetDefinition,
  transition: Transition,
): string => {
  const inputs = transitionInputPlaceIds(transition).map((id) =>
    placeName(net, id),
  );
  const outputs = transitionOutputPlaceIds(transition).map((id) =>
    placeName(net, id),
  );
  return `${inputs.join(", ") || "∅"} → ${outputs.join(", ") || "∅"}`;
};

const colorSummary = (color: Color): string =>
  color.elements.length === 0
    ? "no fields"
    : color.elements
        .map((element) => `${element.name}: ${element.type}`)
        .join(", ");

const parameterSummary = (parameter: Parameter): string =>
  `${parameter.variableName} = ${parameter.defaultValue} (${parameter.type})`;

const equationSummary = (
  net: ActiveNetDefinition,
  equation: DifferentialEquation,
): string => {
  const places = net.places.filter((place) =>
    placeUsesDifferentialEquation(place, equation.id),
  );
  return `${typeName(net, equation.colorId)} · ${places.length} place${places.length === 1 ? "" : "s"}`;
};

/** What a cell's row shows of its entity beside its name. */
export const cellPresentation = (
  net: ActiveNetDefinition,
  cell: NotebookCell,
): { iconColor: string | undefined; summary: string } => {
  switch (cell.kind) {
    case "place":
      return {
        iconColor: net.types.find(({ id }) => id === cell.place.colorId)
          ?.displayColor,
        summary: placeSummary(net, cell.place),
      };
    case "transition":
      return {
        iconColor: undefined,
        summary: transitionSummary(net, cell.transition),
      };
    case "type":
      return {
        iconColor: cell.color.displayColor,
        summary: colorSummary(cell.color),
      };
    case "differentialEquation":
      return {
        iconColor: undefined,
        summary: equationSummary(net, cell.equation),
      };
    case "parameter":
      return {
        iconColor: undefined,
        summary: parameterSummary(cell.parameter),
      };
  }
};
