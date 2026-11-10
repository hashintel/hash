/**
 * Highlighting steps on the canvas (6 Nov sync: "when selecting a node there, it just highlights in the canvas …
 * we should do that anyways"). Anything that names steps (the used-in row, a search) calls `useHighlightSteps()`
 * with their ids; the canvas marks those cards until it is called with null.
 *
 * `?highlight=<stepId>[,<stepId>]` highlights steps from the URL, for demos. `?highlightlook=` picks the look, from
 * the URL only, never remembered:
 * - ring: a faint 1.5 px neutral ring and a soft fill on the highlighted cards. The default.
 * - dim: the other cards drop to 40%.
 * - both: the ring and the dimming.
 */
import { css } from "@hashintel/ds-helpers/css";

import { useEditor } from "./editor-context";
import { useLocation } from "./router";

export type HighlightLook = "ring" | "dim" | "both";

export const highlightLook = (query: URLSearchParams): HighlightLook => {
  const look = query.get("highlightlook");
  // Both is the default (inbox canvas-highlight, decided 10 Nov); `?highlightlook=ring|dim` shows one alone.
  return look === "dim" || look === "ring" ? look : "both";
};

export type Highlight = { ids: string[]; look: HighlightLook };

/** The steps the canvas highlights (the ones set with `useHighlightSteps`, else `?highlight=`) and the look. */
export const useHighlightedSteps = (): Highlight => {
  const { ui } = useEditor();
  const { query } = useLocation();
  const fromUrl = query.get("highlight");
  const ids =
    ui.highlightIds && ui.highlightIds.length > 0
      ? ui.highlightIds
      : fromUrl
        ? fromUrl.split(",").filter(Boolean)
        : [];
  return { ids, look: highlightLook(query) };
};

/** Sets the steps the canvas highlights; null or [] clears it. */
export const useHighlightSteps = () => {
  const { setUi } = useEditor();
  return (stepIds: string[] | null) =>
    setUi((current) => ({
      ...current,
      highlightIds: stepIds && stepIds.length > 0 ? stepIds : null,
    }));
};

// On React Flow's node wrapper, so the card's own styles (and its run mark) stay as they are.
const ringStyle = css({
  "& > div[class]": {
    backgroundColor: "neutral.bgSolid.surface",
    boxShadow: "[0 0 0 1.5px var(--colors-neutral-bd-solid-hover)]",
  },
});

const dimStyle = css({
  opacity: "[0.4]",
  transition: "[opacity 0.15s ease]",
});

/** The canvas's nodes with the highlight classes on: a ring on the highlighted ones, or the others dimmed. */
export const withHighlight = <
  Item extends { id: string; className?: string; parentId?: string },
>(
  nodes: Item[],
  { ids: highlighted, look }: Highlight,
): Item[] => {
  if (highlighted.length === 0) {
    return nodes;
  }
  const ids = new Set(highlighted);
  // A For each box holding a highlighted step stays at full strength, so the step reads as inside it.
  const holders = new Set(
    nodes.flatMap((node) =>
      ids.has(node.id) && node.parentId ? [node.parentId] : [],
    ),
  );
  const ring = look === "ring" || look === "both";
  const dim = look === "dim" || look === "both";
  return nodes.map((node) => {
    const extra = ids.has(node.id)
      ? ring
        ? ringStyle
        : undefined
      : dim && !holders.has(node.id)
        ? dimStyle
        : undefined;
    return extra
      ? {
          ...node,
          className: node.className ? `${node.className} ${extra}` : extra,
        }
      : node;
  });
};
