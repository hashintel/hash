import { useRouter } from "next/router";
import { useMemo } from "react";

import { getLayoutWithSidebar } from "../../shared/layout";
import { exampleTileBySlug } from "../processes.page/example-tiles-data";
import {
  ProcessEditor,
  type ProcessEditorView,
} from "./[uuid].page/process-editor";

import type { NextPageWithLayout } from "../../shared/layout";

/**
 * Single page backing both `/processes/draft` and `/processes/<uuid>`.
 *
 * We deliberately render `<ProcessEditor>` even before `router.isReady`
 * (passing `view={null}`) so the editor's iframe element commits on the
 * very first React render. That parallelises the iframe-bundle download
 * with `router` resolution + Apollo's `persistedNets` query — the iframe
 * starts loading immediately and is typically ready by the time we have
 * everything we need to send `init`.
 *
 * `ProcessEditor` itself isn't imported via `next/dynamic` any more
 * because it no longer pulls Petrinaut into its bundle — only an iframe
 * element and the postMessage bridge — so chunk-splitting it just costs an
 * extra round-trip for no payoff.
 */
const ProcessRoutePage: NextPageWithLayout = () => {
  const router = useRouter();

  const view = useMemo<ProcessEditorView | null>(() => {
    if (!router.isReady) {
      return null;
    }

    const rawUuid = router.query.uuid;
    const uuidParam = Array.isArray(rawUuid) ? rawUuid[0] : rawUuid;

    if (!uuidParam) {
      return null;
    }

    if (uuidParam === "draft") {
      const rawExample = router.query.example;
      const exampleSlug =
        (Array.isArray(rawExample) ? rawExample[0] : rawExample) ?? null;

      if (exampleSlug) {
        const seed = exampleTileBySlug.get(exampleSlug);
        if (!seed) {
          // Unknown slug — fall back to a blank draft rather than blocking
          // the user. The query string is ignored in this case.
          return { kind: "draft", seedKey: null };
        }
        return {
          kind: "draft",
          seedKey: exampleSlug,
          seed: {
            title: seed.title,
            petriNetDefinition: seed.petriNetDefinition,
          },
        };
      }

      return { kind: "draft", seedKey: null };
    }

    return { kind: "saved", entityUuid: uuidParam };
  }, [router.isReady, router.query.uuid, router.query.example]);

  return <ProcessEditor view={view} />;
};

ProcessRoutePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessRoutePage;
