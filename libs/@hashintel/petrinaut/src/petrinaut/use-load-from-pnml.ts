import { useCallback } from "react";
import type { Edge, Node } from "reactflow";

import type {
  ArcData,
  ArcType,
  NodeType,
  PetriNetDefinitionObject,
  PlaceNodeData,
  TokenCounts,
  TokenType,
  TransitionCondition,
  TransitionNodeData,
} from "./types";

const elementToText = (el: Element | null): string =>
  el?.textContent?.trim() ?? "";

const getElementsBySelector = (selector: string, parentNode: ParentNode) =>
  Array.from(parentNode.querySelectorAll(selector));

const readMultiset = (multiset: Element | null): TokenCounts => {
  const counts: TokenCounts = {};

  if (!multiset) {
    return counts;
  }

  for (const el of getElementsBySelector("element", multiset)) {
    const tokId = elementToText(el.querySelector("constant"));
    const mult = parseInt(el.getAttribute("multiplicity") ?? "1", 10);
    counts[tokId] = (counts[tokId] ?? 0) + mult;
  }
  return counts;
};

/**
 * Parse a PNML document that follows the HASH “HLPN + toolspecific” dialect back into a {@link PetriNetDefinitionObject}.
 *
 * @todo this dialect is wrong and needs updating once we have agreed on the format.
 */
const parsePnml = (
  xml: string,
): {
  nodes: NodeType[];
  arcs: ArcType[];
  title: string;
  tokenTypes: TokenType[];
} => {
  const document = new DOMParser().parseFromString(xml, "application/xml");

  const titleElement = document.querySelector("pnml > net > name > text");
  const title = elementToText(titleElement);

  const tokenTypes: TokenType[] = getElementsBySelector("colset", document).map(
    (colset) => {
      const id = colset.getAttribute("id") ?? "";
      const name = elementToText(colset.querySelector("atom"));
      const color = elementToText(
        colset.querySelector('toolspecific[tool="HASH"] > color'),
      );
      return { id, name, color };
    },
  );

  const placeNodes: Node<PlaceNodeData>[] = getElementsBySelector(
    "place",
    document,
  ).map((placeNode) => {
    const id = placeNode.getAttribute("id")!;

    const posEl = placeNode.querySelector("graphics > position");
    const position = {
      x: parseFloat(posEl?.getAttribute("x") ?? "0"),
      y: parseFloat(posEl?.getAttribute("y") ?? "0"),
    };

    const label = elementToText(placeNode.querySelector("name > text"));

    const tokenCounts = readMultiset(
      placeNode.querySelector("initialMarking > multiset"),
    );

    const data: PlaceNodeData = {
      label,
      initialTokenCounts: tokenCounts,
      type: "place",
    };

    return { id, type: "place", position, data };
  });

  const transitionNodes: Node<TransitionNodeData>[] = getElementsBySelector(
    "transition",
    document,
  ).map((transitionNode) => {
    const id = transitionNode.getAttribute("id")!;

    const posEl = transitionNode.querySelector("graphics > position");
    const position = {
      x: parseFloat(posEl?.getAttribute("x") ?? "0"),
      y: parseFloat(posEl?.getAttribute("y") ?? "0"),
    };

    const label = elementToText(transitionNode.querySelector("name > text"));

    const toolSpecificContainer = transitionNode.querySelector(
      'toolspecific[tool="HASH"]',
    );

    const description = elementToText(
      toolSpecificContainer?.querySelector("description") ?? null,
    );

    const delay = toolSpecificContainer
      ? parseFloat(
          elementToText(toolSpecificContainer.querySelector("timing > delay")),
        )
      : undefined;

    const conditions: TransitionCondition[] = toolSpecificContainer
      ? getElementsBySelector("routing > branch", toolSpecificContainer).map(
          (b) => ({
            id: b.getAttribute("id") ?? "",
            name: elementToText(b.querySelector("name > text")),
            probability: parseFloat(b.getAttribute("probability") ?? "0"),
            outputEdgeId: b.getAttribute("outputArc") ?? "",
          }),
        )
      : [];

    const data: TransitionNodeData = {
      label,
      delay: Number.isNaN(delay) ? undefined : delay,
      description,
      conditions: conditions.length ? conditions : undefined,
      type: "transition",
    };

    return { id, type: "transition", position, data };
  });

  const arcs: Edge<ArcData>[] = getElementsBySelector("arc", document).map(
    (a): ArcType => {
      const id = a.getAttribute("id") ?? "";
      const source = a.getAttribute("source") ?? "";
      const target = a.getAttribute("target") ?? "";

      const tokenWeights = readMultiset(
        a.querySelector("inscription > multiset"),
      );

      return {
        id,
        source,
        target,
        data: { tokenWeights },
      };
    },
  );

  return {
    nodes: [...placeNodes, ...transitionNodes],
    arcs,
    tokenTypes,
    title,
  };
};

export const useLoadFromPnml = ({
  createNewNet,
}: {
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
}) => {
  const load = useCallback(
    (xml: string) => {
      const { nodes, arcs, tokenTypes, title } = parsePnml(xml);

      createNewNet({
        petriNetDefinition: {
          arcs,
          nodes,
          tokenTypes,
        },
        title,
      });
    },
    [createNewNet],
  );

  return load;
};
