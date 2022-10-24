import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { PageModel } from "../model";

const createNestedPages = async (
  owningActorId: string,
  [top, nested]: [string, string],
  prevIndex: string | undefined,
  sharedParams: {
    graphApi: GraphApi;
    logger: Logger;
  },
): Promise<PageModel> => {
  const { graphApi } = sharedParams;

  const [topPageModel, nestedPageModel] = await Promise.all([
    PageModel.createPage(graphApi, {
      actorId: owningActorId,
      ownedById: owningActorId,
      title: top,
      prevIndex,
    }),
    PageModel.createPage(graphApi, {
      actorId: owningActorId,
      ownedById: owningActorId,
      title: nested,
    }),
  ]);

  await nestedPageModel.setParentPage(graphApi, {
    actorId: owningActorId,
    parentPageModel: topPageModel,
    prevIndex: topPageModel.getIndex() ?? null,
    nextIndex: null,
  });

  return topPageModel;
};

export type PageList = (string | [string, string])[];

export const seedPages = async (
  pageTitles: PageList,
  owningActorId: string,
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
          actorId: owningActorId,
          ownedById: owningActorId,
          title: pageTitle,
          prevIndex,
        })
      ).getIndex();
    } else {
      prevIndex = (
        await createNestedPages(
          owningActorId,
          pageTitle,
          prevIndex,
          sharedParams,
        )
      ).getIndex();
    }
  }
};
