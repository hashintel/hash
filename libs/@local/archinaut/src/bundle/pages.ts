/**
 * MDX page generation.
 *
 * Output is YAML frontmatter plus CommonMark, with one exception: generated
 * layer pages import the `LayerFacts` and `LayerRelations` cards shipped in
 * the bundle's `components/` directory and pass their facts as structured
 * props, so a host restyles the cards instead of re-parsing prose. A host
 * therefore needs a React-capable MDX pipeline for layer pages, the same
 * requirement authored pages with diagram components already impose.
 * `architecture.md` keeps every fact as plain text for consumers that render
 * none of this.
 *
 * Diagrams are referenced as relative image paths, and every layer page links
 * back to the annotation that declared it so a reader can go straight from the
 * rendered claim to the source of truth.
 */

import { buildInterfacePage } from "./pages/interface-page";
import { buildLayerPage } from "./pages/layer-page";
import { buildOverviewPage } from "./pages/overview-page";
import {
  GENERATED_ORDER_BASE,
  type GeneratedPage,
} from "./pages/shared/page-shape";

import type { ArchitectureModel } from "../model";

export { assetPathFrom, interfaceSlug, layerSlug } from "./shared/page-paths";
export {
  GENERATED_ORDER_BASE,
  frontmatter,
  type GeneratedPage,
} from "./pages/shared/page-shape";

export const buildPages = (
  model: ArchitectureModel,
  options: {
    sourceUrlPrefix: string;
    overviewDiagram: string | null;
    /** Layer id → diagram name showing its dependencies and dependents. */
    neighbourhoodDiagrams: Map<string, string>;
    /** Layer id → diagram name showing its direct children, for parents only. */
    subtreeDiagrams: Map<string, string>;
    /** Authored guides attached to each layer id. */
    guidesByLayer?: Map<
      string,
      { slug: string; title: string; description: string }[]
    >;
  },
): GeneratedPage[] => {
  const layersById = new Map(model.layers.map((layer) => [layer.id, layer]));

  const pages = [buildOverviewPage(model, options.overviewDiagram)];

  model.interfaces.forEach((node, index) => {
    pages.push(
      buildInterfacePage(
        node,
        model,
        options.sourceUrlPrefix,
        GENERATED_ORDER_BASE + model.layers.length + index + 1,
      ),
    );
  });

  model.layers.forEach((layer, index) => {
    pages.push(
      buildLayerPage(
        layer,
        model,
        layersById,
        options.sourceUrlPrefix,
        GENERATED_ORDER_BASE + index + 1,
        options.neighbourhoodDiagrams.get(layer.id) ?? null,
        options.subtreeDiagrams.get(layer.id) ?? null,
        options.guidesByLayer?.get(layer.id) ?? [],
      ),
    );
  });

  return pages;
};
