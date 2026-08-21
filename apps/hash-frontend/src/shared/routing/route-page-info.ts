import { createContext, useContext } from "react";

import type { EntityUuid } from "@blockprotocol/type-system";
import type { NextParsedUrlQuery } from "next/dist/server/request-meta";

export type RoutePageInfo = {
  routePageEntityUuid: EntityUuid;
};

export const RoutePageInfoContext = createContext<RoutePageInfo | undefined>(
  undefined,
);

type PageParsedUrlQuery = {
  shortname: string;
  "page-slug": string;
};

export const isPageParsedUrlQuery = (
  queryParams: NextParsedUrlQuery,
): queryParams is PageParsedUrlQuery =>
  typeof queryParams.shortname === "string" &&
  typeof queryParams["page-slug"] === "string";

export const parsePageUrlQueryParams = (params: PageParsedUrlQuery) => {
  const workspaceShortname = params.shortname.slice(1);

  const pageEntityUuid = params["page-slug"] as EntityUuid;

  return { workspaceShortname, pageEntityUuid };
};

export interface UseRoutePageInfo {
  (options: { allowUndefined: true }): RoutePageInfo | undefined;
  (options?: { allowUndefined?: false }): RoutePageInfo;
}

export const useRoutePageInfo: UseRoutePageInfo = (options = {}) => {
  const contextValue = useContext(RoutePageInfoContext);

  if (!contextValue && !options.allowUndefined) {
    throw new Error("Unable to get page info (missing `page-slug` in URL)");
  }

  return contextValue as RoutePageInfo;
};
