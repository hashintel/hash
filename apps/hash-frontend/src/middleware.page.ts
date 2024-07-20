import type { NextRequest } from "next/server";

import {
  returnTypeAsJson,
  versionedUrlRegExp,
} from "./middleware/return-types-as-json";

export const middleware = async (request: NextRequest) => {
  const accept = request.headers.get("accept");

  const { url } = request;

  const ontologyType = url.match(versionedUrlRegExp)?.[1];

  /**
   * If we are dealing with a request to an ontology type,
   * _UNLESS_ it is a request for an entity type from a browser (accept: text/html),
   * return it as JSON.
   *
   * When we introduce pages for property types and data types, we should remove the ontologyType check.
   */
  if (
    ontologyType &&
    (!accept?.includes("text/html") || ontologyType !== "entity-type")
  ) {
    return returnTypeAsJson(request);
  }
};

/**
 * Allow any cross-origin request for type JSON is set via headers in next.config.js.
 */
export const config = {
  matcher: "/:shortname/types/:path*",
};
