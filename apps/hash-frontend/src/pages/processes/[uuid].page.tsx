import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { validate as isUuid } from "uuid";

import {
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { getLayoutWithSidebar } from "../../shared/layout";
import { usePersistedNets } from "../processes.page/use-persisted-nets";
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
 * `/processes/draft` would start. A net the user can see that already has
 * its uuid opens instead. An `example` naming none of ours is dropped,
 * which opens a blank draft.
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

  const { persistedNets, loading: persistedNetsLoading } = usePersistedNets();

  /** The uuid of a draft URL whose web the user can't create in. */
  const uncreatableDraftUuid =
    draftEntityId === null && uuidParam !== null && isUuid(uuidParam)
      ? uuidParam
      : null;

  /**
   * Whether a net the user can see has `uncreatableDraftUuid`, `undefined`
   * while the nets load. Uuids are unique across webs, so the URL names it.
   */
  const savedUnderUncreatableDraft =
    uncreatableDraftUuid === null
      ? undefined
      : persistedNets.some(
            (net) =>
              extractEntityUuidFromEntityId(net.entityId) ===
              uncreatableDraftUuid,
          )
        ? true
        : persistedNetsLoading
          ? undefined
          : false;

  /**
   * `/processes/draft` names no draft yet, and a draft URL failing its
   * check names none that could be saved, unless its net is saved already:
   * give it one and go there.
   */
  const startsDraft =
    uuidParam === "draft" ||
    (draftEntityId === null &&
      (uncreatableDraftUuid === null || savedUnderUncreatableDraft === false));

  /**
   * A navigation is under way. Next cancels an earlier navigation for a
   * later one, so a start that becomes due while the user is leaving (once
   * the router or workspace is ready) would take them to a new draft
   * instead. It waits until a navigation ends. A cancelled one doesn't: Next
   * cancels only for a newer navigation, and reports the cancellation before
   * that navigation's start. The newer one ends by completing, failing, or
   * leaving the document, or, when it changes only the hash, by the hash
   * change completing.
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
    router.events.on("hashChangeComplete", complete);
    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", complete);
      router.events.off("routeChangeError", fail);
      router.events.off("hashChangeComplete", complete);
    };
  }, [router.events]);

  useEffect(() => {
    if (!startsDraft || !activeWorkspaceWebId || navigating) {
      return;
    }
    void router.replace(
      // The route is fixed; its query is a generated uuid, the active web,
      // and a slug read back from our own example catalog.
      // nosemgrep: typescript.nextjs.react-nextjs-router-push.react-nextjs-router-push
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
      if (draftEntityId === null) {
        return savedUnderUncreatableDraft
          ? { kind: "saved", entityUuid: uuidParam }
          : null;
      }
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
  }, [
    draftEntityId,
    draftWeb,
    example,
    savedUnderUncreatableDraft,
    startsDraft,
    uuidParam,
  ]);

  return <ProcessEditor view={view} />;
};

ProcessRoutePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessRoutePage;
