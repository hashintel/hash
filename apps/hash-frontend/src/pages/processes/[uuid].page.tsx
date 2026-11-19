import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import { entityIdFromComponents } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { getLayoutWithSidebar } from "../../shared/layout";
import { useAuthInfo } from "../shared/auth-info-context";
import { useActiveWorkspace } from "../shared/workspace-context";
import { draftRoute, draftWebQueryParam } from "./[uuid].page/draft-path";
import {
  creatableWebIds,
  draftEntityIdFromQuery,
  exampleFromQuery,
} from "./[uuid].page/draft-query";
import {
  ProcessEditor,
  type ProcessEditorView,
} from "./[uuid].page/process-editor";

import type { NextPageWithLayout } from "../../shared/layout";
import type { EntityUuid } from "@blockprotocol/type-system";

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
 * A draft URL is checked when it opens: one whose uuid is malformed, or
 * whose web is not one the user can create entities in, could never be
 * saved, so it is replaced with a fresh draft in the active workspace, as
 * `/processes/draft` would start. An `example` naming none of ours is
 * dropped, which opens a blank draft.
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
  const { authenticatedUser } = useAuthInfo();

  const uuidParam = router.isReady ? firstQueryValue(router.query.uuid) : null;
  const example = exampleFromQuery(firstQueryValue(router.query.example));
  const exampleSlug = example?.slug ?? null;
  const draftWeb = firstQueryValue(router.query[draftWebQueryParam]);

  const creatableWebs = useMemo(
    () => (authenticatedUser ? creatableWebIds(authenticatedUser) : null),
    [authenticatedUser],
  );

  /**
   * The id a draft URL names, `null` when it names none the user could
   * save, and `undefined` when this is no draft URL or the user's webs are
   * not known yet.
   */
  const draftEntityId =
    uuidParam === null ||
    uuidParam === "draft" ||
    draftWeb === null ||
    creatableWebs === null
      ? undefined
      : draftEntityIdFromQuery({ uuid: uuidParam, draftWeb, creatableWebs });

  /**
   * `/processes/draft` names no draft yet, and a draft URL failing its
   * check names none that could be saved: give it one and go there.
   */
  const startsDraft = uuidParam === "draft" || draftEntityId === null;

  /**
   * A navigation is under way. Next cancels an earlier navigation for a
   * later one, so a start that becomes due while the user is leaving (once
   * the router or workspace is ready) would take them to a new draft
   * instead. It waits until a navigation ends. A cancelled one doesn't: Next
   * cancels only for a newer navigation, which reports its own end, and
   * reports the cancellation before that navigation's start.
   */
  const [navigating, setNavigating] = useState(false);
  useEffect(() => {
    const start = () => setNavigating(true);
    const complete = () => setNavigating(false);
    const fail = (error: { cancelled?: boolean }) => {
      if (!error.cancelled) {
        setNavigating(false);
      }
    };
    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", complete);
    router.events.on("routeChangeError", fail);
    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", complete);
      router.events.off("routeChangeError", fail);
    };
  }, [router.events]);

  useEffect(() => {
    if (!startsDraft || !activeWorkspaceWebId || navigating) {
      return;
    }
    void router.replace(
      draftRoute(
        entityIdFromComponents(
          activeWorkspaceWebId,
          generateUuid() as EntityUuid,
        ),
        exampleSlug,
      ),
    );
  }, [activeWorkspaceWebId, exampleSlug, navigating, router, startsDraft]);

  const view = useMemo<ProcessEditorView | null>(() => {
    if (!uuidParam || startsDraft) {
      return null;
    }

    if (draftWeb !== null) {
      if (draftEntityId === undefined) {
        return null;
      }
      // An unknown slug falls back to a blank draft rather than blocking
      // the user.
      if (!example) {
        return { kind: "draft", seedKey: null, entityId: draftEntityId };
      }
      return {
        kind: "draft",
        seedKey: example.slug,
        seed: {
          title: example.title,
          petriNetDefinition: example.petriNetDefinition,
        },
        entityId: draftEntityId,
      };
    }

    return { kind: "saved", entityUuid: uuidParam };
  }, [draftEntityId, draftWeb, example, startsDraft, uuidParam]);

  return <ProcessEditor view={view} />;
};

ProcessRoutePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessRoutePage;
