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
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";
import { StatusPage } from "../shared/status-page";
import {
  SnapshotError,
  snapshotErrorMessage,
  type SnapshotErrorCode,
} from "../sharing/snapshot";
import { openSnapshot } from "../sharing/snapshot-client";

type SnapshotState =
  | { kind: "loading" }
  | { kind: "ready"; title: string; handle: PetrinautDocHandle }
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
          title: snapshot.title,
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

  return (
    <BrowserOptimizationProvider>
      <ReadonlyDocumentPage
        handle={state.handle}
        title={state.title}
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
