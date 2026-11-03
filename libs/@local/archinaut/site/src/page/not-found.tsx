import { Link } from "@tanstack/react-router";

import { PageFrame } from "./shared/page-frame";

export const NotFound = () => (
  <PageFrame title="Page not found">
    <p>
      Nothing lives at this address.{" "}
      <Link to="/">Start from the front page.</Link>
    </p>
  </PageFrame>
);
