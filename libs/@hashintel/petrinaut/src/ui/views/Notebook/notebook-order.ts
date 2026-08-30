/**
 * Cell ordering for the notebook list.
 *
 * `document` keeps the net's own storage order. `topological` reads like a
 * program: places and transitions follow token flow, and every declaration a
 * cell needs — its token type, differential equation, parameters — is emitted
 * immediately before the first cell that uses it.
 */

import type { CellConnections, NotebookCell } from "./notebook-model";

export type CellOrder = "document" | "topological";

const DECLARATION_KINDS = new Set([
  "type",
  "differentialEquation",
  "parameter",
]);

/**
 * Order cells so nothing is referenced before it is declared.
 *
 * `flowOrder` supplies the place/transition sequence — pass the diagram's
 * layer order so the list and the graph tell the same story. Cells missing
 * from `flowOrder`, and declarations nothing uses, are appended in document
 * order so no cell is ever dropped.
 */
export function orderCellsTopologically(
  cells: NotebookCell[],
  flowOrder: string[],
  connections: Map<string, CellConnections>,
): NotebookCell[] {
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  const emitted = new Set<string>();
  const emitting = new Set<string>();
  const ordered: NotebookCell[] = [];

  const emit = (id: string) => {
    const cell = cellById.get(id);
    if (cell === undefined || emitted.has(id)) {
      return;
    }
    emitted.add(id);
    ordered.push(cell);
  };

  /**
   * Emit the declarations a cell depends on, deepest first — an equation's own
   * token type and parameters come before the equation itself. `emitting`
   * guards against a malformed net looping back on itself.
   */
  const emitDeclarations = (id: string) => {
    if (emitting.has(id)) {
      return;
    }
    emitting.add(id);
    for (const dependency of connections.get(id)?.upstream ?? []) {
      if (
        !DECLARATION_KINDS.has(dependency.type) ||
        emitted.has(dependency.id)
      ) {
        continue;
      }
      emitDeclarations(dependency.id);
      emit(dependency.id);
    }
    emitting.delete(id);
  };

  for (const id of flowOrder) {
    emitDeclarations(id);
    emit(id);
  }

  // Anything the flow order didn't reach: unused declarations, and nodes that
  // aren't part of the graph at all.
  for (const cell of cells) {
    emitDeclarations(cell.id);
    emit(cell.id);
  }

  return ordered;
}
