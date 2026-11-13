import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";

import { entityIdFromComponents } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { getLayoutWithSidebar } from "../../shared/layout";
import { exampleTileBySlug } from "../processes.page/example-tiles-data";
import { useActiveWorkspace } from "../shared/workspace-context";
import { draftPath, draftWebQueryParam } from "./[uuid].page/draft-path";
import {
  ProcessEditor,
  type ProcessEditorView,
} from "./[uuid].page/process-editor";

import type { NextPageWithLayout } from "../../shared/layout";
import type { EntityUuid, WebId } from "@blockprotocol/type-system";

const firstQueryValue = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/**
 * Single page backing `/processes/<uuid>`, for a saved net and for a draft,
 * and `/processes/draft`, which starts a draft.
 *
 * A draft has its final identity from the start: `/processes/draft` picks a
 * uuid, takes the active workspace as the draft's web and replaces itself
 * with `/processes/<uuid>?draftWeb=<web>`. Each draft tab is then its own
 * draft, a reload keeps it, and its first save creates the net under that
 * id. The saved net's URL is the same path without the query, so saving
 * never changes route.
 *
 * We deliberately render `<ProcessEditor>` even before `router.isReady`
 * (passing `view={null}`) so the editor starts loading on the very first
 * React render. That parallelises the editor-bundle download with `router`
 * resolution + Apollo's `persistedNets` query — the editor is typically
 * ready by the time we have the document to pass to it.
 *
 * `ProcessEditor` itself isn't imported via `next/dynamic` because it
 * already loads the Petrinaut editor through its own client-only dynamic
 * import, leaving only the host in its bundle — so chunk-splitting it just
 * costs an extra round-trip for no payoff.
 */
const ProcessRoutePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { activeWorkspaceWebId } = useActiveWorkspace();

  const uuidParam = router.isReady ? firstQueryValue(router.query.uuid) : null;
  const exampleSlug = firstQueryValue(router.query.example);
  const draftWeb = firstQueryValue(router.query[draftWebQueryParam]);

  /** `/processes/draft` names no draft yet: give it one and go there. */
  const startsDraft = uuidParam === "draft";
  useEffect(() => {
    if (!startsDraft || !activeWorkspaceWebId) {
      return;
    }
    void router.replace(
      draftPath(
        entityIdFromComponents(
          activeWorkspaceWebId,
          generateUuid() as EntityUuid,
        ),
        exampleSlug,
      ),
    );
  }, [activeWorkspaceWebId, exampleSlug, router, startsDraft]);

  const view = useMemo<ProcessEditorView | null>(() => {
    if (!uuidParam || startsDraft) {
      return null;
    }

    if (draftWeb !== null) {
      const entityId = entityIdFromComponents(
        draftWeb as WebId,
        uuidParam as EntityUuid,
      );
      // An unknown slug falls back to a blank draft rather than blocking
      // the user.
      const seed = exampleSlug ? exampleTileBySlug.get(exampleSlug) : undefined;
      if (!exampleSlug || !seed) {
        return { kind: "draft", seedKey: null, entityId };
      }
      return {
        kind: "draft",
        seedKey: exampleSlug,
        seed: {
          title: seed.title,
          petriNetDefinition: seed.petriNetDefinition,
        },
        entityId,
      };
    }

    return { kind: "saved", entityUuid: uuidParam };
  }, [draftWeb, exampleSlug, startsDraft, uuidParam]);

  return <ProcessEditor view={view} />;
};

ProcessRoutePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessRoutePage;
