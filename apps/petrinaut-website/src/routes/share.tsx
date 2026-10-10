import {
  createFileRoute,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  createJsonDocHandle,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";

import { validateSharedExampleSearch } from "../examples/example-search";
import { ReadonlyDocumentPage } from "../examples/readonly-document-page";
import { saveNetInStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";
import { StatusPage } from "../shared/status-page";
import {
  SnapshotError,
  snapshotErrorMessage,
  type Snapshot,
  type SnapshotErrorCode,
} from "../sharing/snapshot";
import { openSnapshot } from "../sharing/snapshot-client";

type SnapshotState =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: Snapshot; handle: PetrinautDocHandle }
  | { kind: "error"; code: SnapshotErrorCode };

const SnapshotDocument = ({ hash }: { hash: string }) => {
  const [state, setState] = useState<SnapshotState>({ kind: "loading" });
  const search = useSearch({ from: "/share" });
  const navigate = useNavigate({ from: "/share" });

  // Decoding runs in a worker, so it is an external system to subscribe to.
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
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          code: error instanceof SnapshotError ? error.code : "unavailable",
        });
      },
    );
    return () => controller.abort();
  }, [hash]);

  if (state.kind === "loading") {
    return <StatusPage title="Opening snapshot…" body="Unpacking the link." />;
  }
  if (state.kind === "error") {
    return (
      <StatusPage
        title="Couldn't open snapshot"
        body={snapshotErrorMessage(state.code)}
      />
    );
  }

  const { snapshot, handle } = state;
  return (
    <BrowserOptimizationProvider>
      <ReadonlyDocumentPage
        handle={handle}
        title={snapshot.title}
        onMakeLocalCopy={() => {
          const net = saveNetInStorage(window.localStorage, {
            petriNetDefinition: structuredClone(snapshot.definition),
            title: `${snapshot.title} (copy)`,
          });
          void navigate({
            to: "/local/$netId",
            params: { netId: net.id },
            search,
            hash: "",
          });
        }}
        onSearchChange={(nextSearch, history) => {
          void navigate({
            hash,
            replace: history === "replace",
            search: nextSearch,
          });
        }}
        search={search}
      />
    </BrowserOptimizationProvider>
  );
};

function ShareRoute() {
  const hash = useLocation({ select: (location) => location.hash });
  // Keyed by the fragment, so Back and Forward between snapshots start over.
  return <SnapshotDocument key={hash} hash={hash} />;
}

export const Route = createFileRoute("/share")({
  component: ShareRoute,
  validateSearch: validateSharedExampleSearch,
});
