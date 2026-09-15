import {
  createFileRoute,
  notFound,
  useLoaderData,
  useSearch,
  useNavigate,
} from "@tanstack/react-router";

import { validateSharedExampleSearch } from "../examples/example-search";
import { LocalStorageDemoApp } from "../main/app/local-storage-demo/local-storage-demo-app";
import { readLocalStorageNets } from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";
import { NotFoundPage } from "./-not-found-page";

const LocalDocumentRoute = () => {
  const net = useLoaderData({ from: "/local/$uuid" });
  const search = useSearch({ from: "/local/$uuid" });
  const navigate = useNavigate({ from: "/local/$uuid" });
  return (
    <BrowserOptimizationProvider>
      <LocalStorageDemoApp
        key={net.uuid}
        initialNetId={net.id}
        onNetChange={(nextNet) => {
          void navigate({ params: { uuid: nextNet.uuid }, search: {} });
        }}
        onSearchChange={(nextSearch, history) => {
          void navigate({ replace: history === "replace", search: nextSearch });
        }}
        search={search}
      />
    </BrowserOptimizationProvider>
  );
};

export const Route = createFileRoute("/local/$uuid")({
  component: LocalDocumentRoute,
  loader: ({ params }) => {
    const net = Object.values(readLocalStorageNets(window.localStorage)).find(
      (stored) => stored.uuid === params.uuid.toLowerCase(),
    );
    if (!net) throw notFound();
    return net;
  },
  staleTime: 0,
  notFoundComponent: () => (
    <NotFoundPage
      title="Local document not found"
      description="This document is saved in the browser where it was created. Open this link in that browser, or choose another document."
    />
  ),
  validateSearch: validateSharedExampleSearch,
});
