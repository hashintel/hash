import type { NextRequest } from "next/server";

import { returnTypeAsJson } from "./middleware/return-types-as-json";

export const middleware = async (request: NextRequest) => {
  const accept = request.headers.get("accept");

  if (accept?.includes("application/json")) {
    return returnTypeAsJson(request);
  }
};

export const config = {
  matcher: "/:shortname/types/:path*",
};
