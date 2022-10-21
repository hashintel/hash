import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { PageModel } from "../model";

const createNestedPages = async (
  ownedById: string,
  [top, nested]: [string, string],
  prevIndex: string | undefined,
  sharedParams: {
    graphApi: GraphApi;
    logger: Logger;
  },
): Promise<PageModel> => {
  const { graphApi } = sharedParams;

  const topPageModel = await PageModel.createPage(graphApi, {
    ownedById,
    title: top,
    prevIndex,
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

  return topPageModel;
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

  let prevIndex: string | undefined = undefined;
  for (const pageTitle of pageTitles) {
    if (typeof pageTitle === "string") {
      prevIndex = (
        await PageModel.createPage(graphApi, {
          ownedById,
          title: pageTitle,
          prevIndex,
        })
      ).getIndex();
    } else {
      prevIndex = (
        await createNestedPages(ownedById, pageTitle, prevIndex, sharedParams)
      ).getIndex();
    }
  }
};
