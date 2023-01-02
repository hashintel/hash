import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { AccountId, OwnedById } from "@hashintel/hash-shared/types";

import {
  createPage,
  Page,
  setPageParentPage,
} from "../graph/knowledge/system-types/page";

export type PageDefinition = {
  title: string;
  nestedPages?: PageDefinition[];
};

export const seedPages = async (
  pageDefinitions: PageDefinition[],
  owningActorId: AccountId,
  sharedParams: {
    graphApi: GraphApi;
    logger: Logger;
  },
  parentPage?: Page,
) => {
  const { graphApi } = sharedParams;

  let prevIndex: string | undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPage: Page = await createPage(
      { graphApi },
      {
        actorId: owningActorId,
        ownedById: owningActorId as OwnedById,
        title: pageDefinition.title,
        prevIndex,
      },
    );

    if (parentPage) {
      await setPageParentPage(
        { graphApi },
        {
          page: newPage,
          actorId: owningActorId,
          parentPage,
          prevIndex: parentPage.index ?? null,
          nextIndex: null,
        },
      );
    }

    prevIndex = newPage.index;

    if (pageDefinition.nestedPages) {
      await seedPages(
        pageDefinition.nestedPages,
        owningActorId,
        sharedParams,
        newPage,
      );
    }
  }
};
