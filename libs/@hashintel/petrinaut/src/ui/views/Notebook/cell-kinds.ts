/**
 * Shared per-kind presentation for the notebook view, so cells, the graph
 * explorer and the kind filter all give a kind the same icon and label.
 */

import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../constants/entity-icons";

import type { NotebookCellKind } from "./notebook-model";
import type { ComponentType } from "react";

export const CELL_KIND_ICONS: Record<
  NotebookCellKind,
  ComponentType<{ size: number }>
> = {
  place: PlaceFilledIcon,
  transition: TransitionFilledIcon,
  type: TokenTypeIcon,
  differentialEquation: DifferentialEquationIcon,
  parameter: ParameterIcon,
};

/** Keyword shown before a cell's name, as a declaration would read. */
export const CELL_KIND_LABELS: Record<NotebookCellKind, string> = {
  place: "Place",
  transition: "Transition",
  type: "Type",
  differentialEquation: "Equation",
  parameter: "Parameter",
};

/** Kinds in the order the filter row lists them. */
export const CELL_KINDS: NotebookCellKind[] = [
  "place",
  "transition",
  "type",
  "differentialEquation",
  "parameter",
];

export const CELL_KIND_PLURAL_LABELS: Record<NotebookCellKind, string> = {
  place: "Places",
  transition: "Transitions",
  type: "Types",
  differentialEquation: "Equations",
  parameter: "Parameters",
};
