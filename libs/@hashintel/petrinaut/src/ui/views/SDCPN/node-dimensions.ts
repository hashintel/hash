/**
 * Visual node dimensions for SDCPN rendering. The compact / classic split is
 * a visualization choice driven by `userSettings.compactNodes`.
 *
 * ## Design note: rendering vs. layout
 *
 * These constants describe **how nodes are drawn**, not how they are
 * positioned. Graph layout (`lib/calculate-graph-layout.ts`) must be stable
 * across the user's visualization choice — switching compact ↔ classic must
 * not shift node positions, otherwise toggling the setting would visually
 * scramble the user's graph.
 *
 * When auto-layout runs (`run-auto-layout.ts`), it should feed
 * `calculateGraphLayout` a single `layoutNodeDimensions` value — per-axis
 * max of compact and classic — independent of the active rendering choice:
 *
 * ```ts
 * export const layoutNodeDimensions = {
 *   place: { width: 180, height: 130 },     // max(compact.place, classic.place)
 *   transition: { width: 180, height: 80 }, // max(compact.tx,    classic.tx)
 * };
 * ```
 *
 * Not implemented yet — today's auto-layout still passes the active
 * rendering dimensions, so running layout after the user has toggled
 * `compactNodes` can shift positions.
 */

export const compactNodeDimensions = {
  place: { width: 180, height: 48 },
  transition: { width: 180, height: 48 },
};

export const classicNodeDimensions = {
  place: { width: 130, height: 130 },
  transition: { width: 160, height: 80 },
};
