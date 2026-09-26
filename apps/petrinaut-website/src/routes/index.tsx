import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { validateSharedExampleSearch } from "../examples/example-search";
import { LocalStorageDemoApp } from "../main/app/local-storage-demo/local-storage-demo-app";
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";

function IndexRoute() {
  const navigate = useNavigate({ from: "/" });
  const search = useSearch({ from: "/" });

  return (
    <BrowserOptimizationProvider>
      <LocalStorageDemoApp
        onSearchChange={(nextSearch, history) => {
          void navigate({ replace: history === "replace", search: nextSearch });
        }}
        search={search}
      />
    </BrowserOptimizationProvider>
  );
}

export const Route = createFileRoute("/")({
  component: IndexRoute,
  validateSearch: validateSharedExampleSearch,
});
