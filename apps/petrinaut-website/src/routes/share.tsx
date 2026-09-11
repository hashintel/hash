import {
  createFileRoute,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  createJsonDocHandle,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";

import { validateSharedExampleSearch } from "../examples/example-search";
import { saveLocalStorageNet } from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";
import { ReadonlyDocumentPage } from "../main/app/readonly-document-page";
import {
  SnapshotError,
  snapshotErrorMessage,
  type Snapshot,
  type SnapshotErrorCode,
} from "../sharing/snapshot";
import { openSnapshot } from "../sharing/snapshot-client";
import { NotFoundPage } from "./-not-found-page";

type SnapshotState =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: Snapshot; handle: PetrinautDocHandle }
  | { kind: "error"; code: SnapshotErrorCode };

const SnapshotDocument = ({ hash }: { hash: string }) => {
  const [state, setState] = useState<SnapshotState>({ kind: "loading" });
  const search = useSearch({ from: "/share" });
  const navigate = useNavigate({ from: "/share" });
  useEffect(() => {
    const controller = new AbortController();
    void openSnapshot(hash, controller.signal).then(
      (snapshot) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "ready",
          snapshot,
          handle: createJsonDocHandle({
            id: `snapshot:${crypto.randomUUID()}`,
            initial: snapshot.definition,
            capabilities: { readonly: true },
            historyLimit: 0,
          }),
        });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            kind: "error",
            code: error instanceof SnapshotError ? error.code : "unavailable",
          });
        }
      },
    );
    return () => controller.abort();
  }, [hash]);

  if (state.kind === "loading")
    return (
      <main
        className={css({
          display: "grid",
          placeItems: "center",
          minHeight: "[100vh]",
          color: "neutral.s70",
          fontSize: "sm",
        })}
      >
        <p role="status">Opening snapshot…</p>
      </main>
    );
  if (state.kind === "error")
    return (
      <NotFoundPage
        title="Couldn't open snapshot"
        description={snapshotErrorMessage(state.code)}
      />
    );
  const { snapshot, handle } = state;
  return (
    <BrowserOptimizationProvider>
      <ReadonlyDocumentPage
        handle={handle}
        title={snapshot.title}
        search={search}
        onSearchChange={(nextSearch, history) => {
          void navigate({
            search: nextSearch,
            hash,
            replace: history === "replace",
          });
        }}
        onFork={() => {
          const net = saveLocalStorageNet(window.localStorage, {
            title: `${snapshot.title} (copy)`,
            petriNetDefinition: structuredClone(snapshot.definition),
          });
          void navigate({
            to: "/local/$uuid",
            params: { uuid: net.uuid },
            search,
            hash: "",
          });
        }}
      />
    </BrowserOptimizationProvider>
  );
};

const ShareRoute = () => {
  const hash = useLocation({ select: (location) => location.hash });
  return <SnapshotDocument key={hash} hash={hash} />;
};

export const Route = createFileRoute("/share")({
  component: ShareRoute,
  validateSearch: validateSharedExampleSearch,
});
