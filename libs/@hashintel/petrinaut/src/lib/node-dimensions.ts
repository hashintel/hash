/**
 * Visual node dimensions used both by the layout engine (called from the
 * Mutation bridge in `/react`) and by the React Flow rendering in `/ui`.
 *
 * Lives in `/lib` (neutral, no layer assignment) so neither layer needs to
 * reach across the `react → ui` boundary.
 */

export const compactNodeDimensions = {
  place: { width: 180, height: 48 },
  transition: { width: 180, height: 48 },
};

export const classicNodeDimensions = {
  place: { width: 130, height: 130 },
  transition: { width: 160, height: 80 },
};
