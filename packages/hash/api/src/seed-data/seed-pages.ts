import { Logger } from "@local/hash-backend-utils/logger";
import { AccountId, OwnedById } from "@local/hash-isomorphic-utils/types";

import { ImpureGraphContext } from "../graph";
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
    logger: Logger;
    context: ImpureGraphContext;
  },
  parentPage?: Page,
) => {
  const { context } = sharedParams;

  let prevIndex: string | undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPage: Page = await createPage(context, {
      actorId: owningActorId,
      ownedById: owningActorId as OwnedById,
      title: pageDefinition.title,
      prevIndex,
    });

    if (parentPage) {
      await setPageParentPage(context, {
        page: newPage,
        actorId: owningActorId,
        parentPage,
        prevIndex: parentPage.index ?? null,
        nextIndex: null,
      });
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
