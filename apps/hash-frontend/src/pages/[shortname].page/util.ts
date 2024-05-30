import type { SimpleEntity } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import type { NextParsedUrlQuery } from "next/dist/server/request-meta";

export type ProfilePageTab =
  | {
      kind: "profile";
      title: string;
    }
  | {
      kind: "pinned-entity-type";
      entityTypeBaseUrl: BaseUrl;
      entityType?: EntityTypeWithMetadata;
      pluralTitle?: string;
      title?: string;
      entities?: SimpleEntity[];
      entitiesSubgraph?: Subgraph<EntityRootType>;
    };

export const parseProfilePageUrlQueryParams = (
  queryParams: NextParsedUrlQuery | undefined,
) => {
  const paramsShortname = queryParams?.shortname;

  if (!paramsShortname || typeof paramsShortname !== "string") {
    throw new Error("Could not parse `shortname` from query params.");
  }

  const profileShortname = paramsShortname.slice(1);

  const paramsCurrentTabTitle = queryParams.tab;

  const currentTabTitle =
    typeof paramsCurrentTabTitle === "string"
      ? paramsCurrentTabTitle
      : "Profile";

  return { profileShortname, currentTabTitle };
};

export const leftColumnWidth = 150;
