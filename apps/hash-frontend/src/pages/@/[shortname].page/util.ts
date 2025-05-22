import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { NextParsedUrlQuery } from "next/dist/server/request-meta";

export type ProfilePageTab =
  | {
      kind: "profile";
      title: string;
    }
  | {
      kind: "types";
      title: string;
    }
  | {
      kind: "pinned-entity-type";
      entityTypeBaseUrl: BaseUrl;
      entityType?: EntityTypeWithMetadata;
      pluralTitle?: string;
      title?: string;
      entities?: HashEntity[];
      entitiesSubgraph?: Subgraph<EntityRootType<HashEntity>>;
    };

export const parseProfilePageUrlQueryParams = (
  queryParams: NextParsedUrlQuery | undefined,
) => {
  const profileShortname = queryParams?.shortname;

  if (!profileShortname || typeof profileShortname !== "string") {
    throw new Error("Could not parse `shortname` from query params.");
  }

  const paramsCurrentTabTitle = queryParams.tab;

  const currentTabTitle =
    typeof paramsCurrentTabTitle === "string"
      ? paramsCurrentTabTitle
      : "Profile";

  return { profileShortname, currentTabTitle };
};

export const leftColumnWidth = 150;
