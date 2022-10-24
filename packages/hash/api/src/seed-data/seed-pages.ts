import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { PageModel } from "../model";

export type PageDefinition = {
  title: string;
  nestedPages: PageDefinition[];
};

export const seedPages = async (
  pageDefinitions: PageDefinition[],
  owningActorId: string,
  sharedParams: {
    graphApi: GraphApi;
    logger: Logger;
  },
  parentPageModel: PageModel | null = null,
) => {
  const { graphApi } = sharedParams;

  let prevIndex: string | undefined = undefined;

  for (const pageDefinition of pageDefinitions) {
    const newPageModel: PageModel = await PageModel.createPage(graphApi, {
      actorId: owningActorId,
      ownedById: owningActorId,
      title: pageDefinition.title,
      prevIndex,
    });

    if (parentPageModel) {
      await newPageModel.setParentPage(graphApi, {
        actorId: owningActorId,
        parentPageModel,
        prevIndex: parentPageModel.getIndex() ?? null,
        nextIndex: null,
      });
    }

    prevIndex = newPageModel.getIndex();

    await seedPages(
      pageDefinition.nestedPages,
      owningActorId,
      sharedParams,
      newPageModel,
    );
  }
};
