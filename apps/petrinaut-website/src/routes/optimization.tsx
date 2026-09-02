import {
  createFileRoute,
  notFound,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { validateSharedExampleSearch } from "../examples/example-search";
import { OptimizationDemoApp } from "../main/app/optimization-demo/optimization-demo-app";

function OptimizationRoute() {
  const navigate = useNavigate({ from: "/optimization" });
  const search = useSearch({ from: "/optimization" });

  return (
    <OptimizationDemoApp
      onSearchChange={(nextSearch, history) => {
        void navigate({ replace: history === "replace", search: nextSearch });
      }}
      search={search}
    />
  );
}

export const Route = createFileRoute("/optimization")({
  beforeLoad: () => {
    if (import.meta.env.VITE_PETRINAUT_OPT_PROVIDER !== "service") {
      throw notFound();
    }
  },
  component: OptimizationRoute,
  validateSearch: validateSharedExampleSearch,
});
