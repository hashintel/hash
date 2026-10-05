import { Link } from "@tanstack/react-router";

import { StatusPage } from "../shared/status-page";

export const NotFoundPage = () => (
  <StatusPage
    title="Page not found"
    body="The requested Petrinaut page does not exist."
    homeLink={(style) => (
      <Link style={style} to="/">
        Back to Petrinaut
      </Link>
    )}
  />
);
