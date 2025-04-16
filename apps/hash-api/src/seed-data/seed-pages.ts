import type { WebId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import type { ImpureGraphContext } from "../graph/context-types";
import type { Page } from "../graph/knowledge/system-types/page";
import {
  createPage,
  setPageParentPage,
} from "../graph/knowledge/system-types/page";

export type PageDefinition = {
  title: string;
  nestedPages?: PageDefinition[];
};

export const seedPages = async (
  authentication: AuthenticationContext,
  pageDefinitions: PageDefinition[],
  webId: WebId,
  sharedParams: {
    logger: Logger;
    context: ImpureGraphContext<false, true>;
  },
  parentPage?: Page,
) => {
  const { context } = sharedParams;

  let prevFractionalIndex: string | undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPage: Page = await createPage(context, authentication, {
      webId,
      title: pageDefinition.title,
      prevFractionalIndex,
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

    prevFractionalIndex = newPage.fractionalIndex;

    if (pageDefinition.nestedPages) {
      await seedPages(
        authentication,
        pageDefinition.nestedPages,
        webId,
        sharedParams,
        newPage,
      );
    }
  }
};
