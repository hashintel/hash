import { arcPlaceId } from "../notebook-model";

import type { ActiveNetDefinition } from "../../../../react/state/active-net-context";
import type { NotebookCell } from "../notebook-model";

/** One focusable line inside an expanded cell body, in visual order. */
type CellBodyPart = {
  id: string;
  /**
   * Focusable cells on this line, left to right. 1 means the whole line is
   * one full-width focus target; more means horizontal arrows walk the
   * line's cells individually (an arc's place, weight and type).
   */
  columns: number;
};

const bodyPart = (id: string, columns = 1): CellBodyPart => ({
  id,
  columns,
});

/**
 * The focusable parts an expanded cell contributes to the list's focus flow,
 * in the order the body renders them, with the cells each line exposes. Must
 * stay in step with the body components of `cell-body.tsx`: a declared part
 * with no matching `data-cell-part` element is a stop arrows can never land
 * on, and a declared column with no matching cell falls back to the line's
 * first.
 */
export function cellBodyParts(
  cell: NotebookCell,
  net: ActiveNetDefinition,
): CellBodyPart[] {
  switch (cell.kind) {
    case "transition": {
      const { transition } = cell;
      const arcParts = (
        prefix: string,
        targets: (string | null)[],
        columns: number,
      ): CellBodyPart[] =>
        targets.flatMap((target, index) =>
          target === null ? [] : [bodyPart(`${prefix}-${index}`, columns)],
        );
      return [
        bodyPart("name"),
        // Input arcs expose place, weight and type; outputs have no type.
        ...arcParts("in", transition.inputArcs.map(arcPlaceId), 3),
        ...arcParts("out", transition.outputArcs.map(arcPlaceId), 2),
        bodyPart("code-lambda"),
        bodyPart("code-kernel"),
      ];
    }
    case "place": {
      const { place } = cell;
      const hasEquationCell =
        place.dynamicsEnabled && net.differentialEquations.length > 0;
      return [
        bodyPart("name"),
        bodyPart("type"),
        bodyPart("dynamics", hasEquationCell ? 2 : 1),
        ...(place.isPort ? [bodyPart("port")] : []),
        ...(place.visualizerCode?.trim() ? [bodyPart("code-visualizer")] : []),
      ];
    }
    case "type":
      return [
        bodyPart("name"),
        bodyPart("display-color"),
        ...cell.color.elements.map((element) =>
          bodyPart(`field-${element.elementId}`, 2),
        ),
      ];
    case "differentialEquation":
      return [bodyPart("name"), bodyPart("type"), bodyPart("code")];
    case "parameter":
      return [
        bodyPart("name"),
        bodyPart("variable-name"),
        bodyPart("type"),
        bodyPart("default-value"),
      ];
  }
}

/** The stop id a body part contributes to the list's focus flow. */
export const partStopId = (cellId: string, partId: string): string =>
  `${cellId} ${partId}`;

export interface CellRowFocus {
  /** The part's stop in the list's focus flow. */
  stopId: string;
  /** 0 for the list's one tabbable row, -1 for the rest (roving tab stop). */
  tabIndex: 0 | -1;
  /** Reports row focus, keeping selection and the roving stop in step. */
  onFocus: () => void;
  /** Vertical arrow navigation — the keys the row doesn't own itself. */
  onNavigate: React.KeyboardEventHandler;
}

/** What an expanded body needs to enrol its parts in the focus flow. */
export type BodyPartContext = {
  /** Accessors for the part's stop; `column` defaults to the line's first. */
  focusFor: (partId: string, column?: number) => CellRowFocus;
  navigateToCell: (cellId: string) => void;
};
