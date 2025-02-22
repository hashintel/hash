import { get } from "@vercel/edge-config";
import { type NextRequest, NextResponse } from "next/server";

import {
  returnTypeAsJson,
  versionedUrlRegExp,
} from "./middleware/return-types-as-json";
import { maintenanceRoute } from "./pages/shared/maintenance";

export const middleware = async (request: NextRequest) => {
  /**
   * 1. Check if the maintenance page should be shown
   */
  if (process.env.EDGE_CONFIG) {
    /**
     * To test this functionality, set the EDGE_CONFIG environment variable to the connection string for an Edge Config store,
     * and set the isInMaintenanceMode key to true in the store.
     *
     * You can get the connection string from the Vercel Dashboard, having set up an appropriate store.
     */
    try {
      const isInMaintenanceMode = await get("isInMaintenanceMode");

      if (isInMaintenanceMode) {
        return NextResponse.rewrite(new URL(maintenanceRoute, request.url));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Error fetching isInMaintenanceMode from edge config: ${error}`,
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn("EDGE_CONFIG env var is not set");
  }

  /**
   * 2. Check if the request is for an ontology type in JSON format
   */
  const accept = request.headers.get("accept");

  const { url } = request;

  const ontologyType = url.match(versionedUrlRegExp)?.[1];

  /**
   * If we are dealing with a request to an ontology type,
   * _UNLESS_ it is a request for an entity type from a browser (accept: text/html), return it as JSON.
   *
   * When we introduce pages for property types and data types, we should remove the ontologyType check.
   *
   * Support for external requests depends on allowing any cross-origin request for type JSON, which is set via headers in next.config.js
   */

  if (
    ontologyType &&
    (!accept?.includes("text/html") || ontologyType === "property-type")
  ) {
    return returnTypeAsJson(request);
  }
};

export const config = {
  /**
   * Stop middleware running on API routes, static files, and Next.js internals
   * @see https://github.com/vercel/next.js/discussions/36308
   */
  matcher: "/((?!api|static|.*\\..*|_next).*)",
};
