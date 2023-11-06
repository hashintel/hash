import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph";

import { ImpureGraphContext } from "../graph/context-types";
import {
  createPage,
  Page,
  setPageParentPage,
} from "../graph/knowledge/system-types/page";
import { AuthenticationContext } from "../graphql/authentication-context";

export type PageDefinition = {
  title: string;
  nestedPages?: PageDefinition[];
};

export const seedPages = async (
  authentication: AuthenticationContext,
  pageDefinitions: PageDefinition[],
  ownedById: OwnedById,
  sharedParams: {
    logger: Logger;
    context: ImpureGraphContext;
  },
  parentPage?: Page,
) => {
  const { context } = sharedParams;

  let prevFractionalIndex: string | undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPage: Page = await createPage(context, authentication, {
      ownedById,
      title: pageDefinition.title,
      prevFractionalIndex,
    });

    if (parentPage) {
      await setPageParentPage(context, authentication, {
        page: newPage,
        parentPage,
        prevFractionalIndex: parentPage.fractionalIndex ?? null,
        nextIndex: null,
      });
    }

    prevFractionalIndex = newPage.fractionalIndex;

    if (pageDefinition.nestedPages) {
      await seedPages(
        authentication,
        pageDefinition.nestedPages,
        ownedById,
        sharedParams,
        newPage,
      );
    }
  }
};
