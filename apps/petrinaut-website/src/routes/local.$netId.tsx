import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";

import { validateSharedExampleSearch } from "../examples/example-search";
import { LocalStorageDemoApp } from "../main/app/local-storage-demo/local-storage-demo-app";
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";

function LocalDocumentRoute() {
  const navigate = useNavigate({ from: "/local/$netId" });
  const { netId } = useParams({ from: "/local/$netId" });
  const search = useSearch({ from: "/local/$netId" });

  return (
    <BrowserOptimizationProvider>
      <LocalStorageDemoApp
        netId={netId}
        onOpenNet={(nextNetId) => {
          void navigate({ params: { netId: nextNetId }, search: {} });
        }}
        onSearchChange={(nextSearch, history) => {
          void navigate({ replace: history === "replace", search: nextSearch });
        }}
        search={search}
      />
    </BrowserOptimizationProvider>
  );
}

export const Route = createFileRoute("/local/$netId")({
  component: LocalDocumentRoute,
  validateSearch: validateSharedExampleSearch,
});
