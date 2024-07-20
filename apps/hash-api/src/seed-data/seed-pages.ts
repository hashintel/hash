import type { Logger } from "@local/hash-backend-utils/logger";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { OwnedById } from "@local/hash-graph-types/web";

import type { ImpureGraphContext } from "../graph/context-types";
import type {
  createPage,
  Page,
  setPageParentPage,
} from "../graph/knowledge/system-types/page";

export interface PageDefinition {
  title: string;
  nestedPages?: PageDefinition[];
}

export const seedPages = async (
  authentication: AuthenticationContext,
  pageDefinitions: PageDefinition[],
  ownedById: OwnedById,
  sharedParams: {
    logger: Logger;
    context: ImpureGraphContext<false, true>;
  },
  parentPage?: Page,
) => {
  const { context } = sharedParams;

  let previousFractionalIndex: string | undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPage: Page = await createPage(context, authentication, {
      ownedById,
      title: pageDefinition.title,
      prevFractionalIndex: previousFractionalIndex,
      type: "document",
    });

    if (parentPage) {
      await setPageParentPage(context, authentication, {
        page: newPage,
        parentPage,
        prevFractionalIndex: parentPage.fractionalIndex ?? null,
        nextIndex: null,
      });
    }

    previousFractionalIndex = newPage.fractionalIndex;

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
