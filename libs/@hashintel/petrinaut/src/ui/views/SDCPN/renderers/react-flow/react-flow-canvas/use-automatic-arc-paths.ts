import { use } from "react";

import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { useStableItems } from "../../../use-stable-items";
import { getOutlineArcPath, getOutlineNode } from "./shared/outline-arcs";
import { getSquareArcPath, getSquareArcRoute } from "./shared/square-arcs";

import type { CanvasScene, CanvasNode } from "../../../canvas-scene";
import type { OutlineArcPath } from "./shared/outline-arcs";

type RoutingScene = {
  id: string;
  nodes: Pick<CanvasNode, "id" | "kind" | "position" | "width" | "height">[];
  arcs: { id: string; sourceId: string; targetId: string }[];
};

const routeArcs = (
  scene: RoutingScene,
  compactNodes: boolean,
  square: boolean,
  avoidObstacles: boolean,
) => {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const connections = new Set(
    scene.arcs.map((arc) => JSON.stringify([arc.sourceId, arc.targetId])),
  );
  const paths = new Map<string, OutlineArcPath>();
  for (const arc of scene.arcs) {
    const source = nodesById.get(arc.sourceId);
    const target = nodesById.get(arc.targetId);
    const sourceOutline = source && getOutlineNode(source, compactNodes);
    const targetOutline = target && getOutlineNode(target, compactNodes);
    if (!sourceOutline || !targetOutline) continue;
    const hasReverseArc = connections.has(
      JSON.stringify([arc.targetId, arc.sourceId]),
    );
    paths.set(
      arc.id,
      square
        ? getSquareArcPath(
            getSquareArcRoute(sourceOutline, targetOutline, {
              hasReverseArc,
              avoidObstacles,
              obstacles: avoidObstacles
                ? scene.nodes
                    .filter(
                      (node) =>
                        node.id !== arc.sourceId && node.id !== arc.targetId,
                    )
                    .map((node) => ({ ...node, cornerRadius: 0 }))
                : [],
            }),
          )
        : getOutlineArcPath(sourceOutline, targetOutline, hasReverseArc),
    );
  }
  return paths;
};

export const useAutomaticArcPaths = (
  scene: CanvasScene,
): Map<string, OutlineArcPath> => {
  const {
    enableAutomaticArcConnections,
    automaticArcRendering,
    avoidArcObstacles,
    compactNodes,
  } = use(UserSettingsContext);
  const [routingScene] = useStableItems<RoutingScene>([
    {
      id: "routing",
      nodes: enableAutomaticArcConnections
        ? scene.nodes.map(({ id, kind, position, width, height }) => ({
            id,
            kind,
            position,
            width,
            height,
          }))
        : [],
      arcs: enableAutomaticArcConnections
        ? scene.arcs
            .filter((arc) => !arc.sourcePortId && !arc.targetPortId)
            .map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId }))
        : [],
    },
  ]);
  return enableAutomaticArcConnections && routingScene
    ? routeArcs(
        routingScene,
        compactNodes,
        automaticArcRendering === "square",
        avoidArcObstacles,
      )
    : new Map();
};
