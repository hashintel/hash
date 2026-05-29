import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { getLayoutWithSidebar } from "../../shared/layout";
import { exampleTileBySlug } from "../processes.page/example-tiles-data";

import type { NextPageWithLayout } from "../../shared/layout";
import type { ProcessEditorView } from "./[uuid].page/process-editor";

// Petrinaut uses Web Workers, Canvas, Monaco Editor, and the TypeScript compiler
// which all require browser APIs — must not be server-rendered.
const ProcessEditor = dynamic(
  () =>
    import("./[uuid].page/process-editor").then((mod) => ({
      default: mod.ProcessEditor,
    })),
  { ssr: false },
);

/**
 * Single page backing both `/processes/draft` and `/processes/<uuid>`.
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

  if (!view) {
    return null;
  }

  return <ProcessEditor view={view} />;
};

ProcessRoutePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessRoutePage;
