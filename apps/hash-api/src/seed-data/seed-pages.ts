import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph";

import { ImpureGraphContext } from "../graph";
import {
  createPage,
  Page,
  setPageParentPage,
} from "../graph/knowledge/system-types/page";
import { systemUserAccountId } from "../graph/system-user";

export type PageDefinition = {
  title: string;
  nestedPages?: PageDefinition[];
};

export const seedPages = async (
  pageDefinitions: PageDefinition[],
  ownedById: OwnedById,
  sharedParams: {
    logger: Logger;
    context: ImpureGraphContext;
  },
  parentPage?: Page,
) => {
  const { context } = sharedParams;
  const authentication = { actorId: systemUserAccountId };

  let prevIndex: string | undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPage: Page = await createPage(context, authentication, {
      ownedById,
      title: pageDefinition.title,
      prevIndex,
    });

    if (parentPage) {
      await setPageParentPage(context, authentication, {
        page: newPage,
        parentPage,
        prevIndex: parentPage.index ?? null,
        nextIndex: null,
      });
    }

    prevIndex = newPage.index;

    if (pageDefinition.nestedPages) {
      await seedPages(
        pageDefinition.nestedPages,
        ownedById,
        sharedParams,
        newPage,
      );
    }
  }
};
