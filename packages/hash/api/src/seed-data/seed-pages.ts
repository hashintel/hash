import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { PageModel } from "../model";

const createNestedPages = async (
  ownedById: string,
  [top, nested]: [string, string],
  previousPageModel: PageModel | null,
  sharedParams: {
    graphApi: GraphApi;
    logger: Logger;
  },
) => {
  const { graphApi } = sharedParams;

  const topPageModel = await PageModel.createPage(graphApi, {
    ownedById,
    title: top,
    prevIndex: previousPageModel?.getIndex() ?? undefined,
  });

  const nestedPageModel = await PageModel.createPage(graphApi, {
    ownedById,
    title: nested,
  });

  await nestedPageModel.setParentPage(graphApi, {
    parentPageModel: topPageModel,
    setById: ownedById,
    prevIndex: topPageModel.getIndex() ?? null,
    nextIndex: null,
  });
};

export type PageList = (string | [string, string])[];

export const seedPages = async (
  pageTitles: PageList,
  ownedById: string,
  sharedParams: {
    graphApi: GraphApi;
    logger: Logger;
  },
) => {
  const { graphApi } = sharedParams;

  let previous = null;
  for (const pageTitle of pageTitles) {
    if (typeof pageTitle === "string") {
      previous = await PageModel.createPage(graphApi, {
        ownedById,
        title: pageTitle,
      });
    } else {
      await createNestedPages(ownedById, pageTitle, previous, sharedParams);
    }
  }
};
