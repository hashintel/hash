import { useRef } from "react";

import type { CanvasArcFocus } from "../../../canvas-focus";
import type { CanvasArc, CanvasScene } from "../../../canvas-scene";

type ArcHeadRoles = ReadonlyMap<string, CanvasArcFocus>;

const rolesOf = (arcs: CanvasArc[]): ArcHeadRoles => {
  const roles = new Map<string, CanvasArcFocus>();
  for (const arc of arcs) {
    if (arc.focus !== "none") {
      roles.set(arc.id, arc.focus);
    }
  }
  return roles;
};

/**
 * The role that chooses each arc's arrowhead, by arc id: the arc's own role
 * while the canvas has a focus, and after the focus ends the role the arc had
 * in it. An arc that is not listed has the head of the arcs with no role.
 *
 * The arcs with no role share a head, which the pane fades. When the focus
 * ends, that head takes the length of the fade to come back to full strength.
 * An arc that had a role is at full strength already, and with the shared
 * head it would show a pale head on its line for that long. So it keeps the
 * head of its role, which does not fade, until the canvas has a focus again.
 *
 * This is a render-time memory of an earlier render, as `useStableItems` is,
 * and it opts out of the React Compiler and of the `react/refs` rule for the
 * same reason. It is idempotent: what it returns depends only on this scene
 * and on the last scene that had a focus, and the heads it tells apart look
 * the same once the fade is over.
 */
export const useArcHeadRoles = (scene: CanvasScene): ArcHeadRoles => {
  "use no memo";

  const last = useRef<{ arcs: CanvasArc[]; roles: ArcHeadRoles }>({
    arcs: [],
    roles: new Map(),
  });

  /* eslint-disable react/refs -- see the function-level comment. */
  if (scene.focusActive && scene.arcs !== last.current.arcs) {
    last.current = { arcs: scene.arcs, roles: rolesOf(scene.arcs) };
  }
  return last.current.roles;
  /* eslint-enable react/refs */
};
