import { createFileRoute, redirect } from "@tanstack/react-router";

// There is no example index page: examples are embed and deep-link content.
export const Route = createFileRoute("/examples/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
