import { ApolloError } from "apollo-server-express";
import { FieldNode } from "graphql";
import {
  Page,
  UnresolvedGQLPage,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import {
  PageProperties as GQLPageProperties,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

/**
 * IMPORTANT NOTE: this is a temporary field resolver and will be deprecated
 * once API consumers have been refactored to stop accessing `properties.contents`
 * of a Page, and access these using the `linkGroups` or `contents` fields instead
 *
 * @deprecated
 */
export const pageProperties: Resolver<
  Promise<
    Omit<GQLPageProperties, "contents"> & {
      contents: UnresolvedGQLUnknownEntity[] | null;
    }
  >,
  UnresolvedGQLPage,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }, info) => {
  const { db } = dataSources;
  const page = await Page.getPageById(db, { accountId, entityId });

  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const { fieldNodes } = info;

  const propertiesFieldNode = fieldNodes.find(
    ({ name }) => name.value === "properties",
  );

  /** Only fetch contents of page if it is a requested field in the query */
  const shouldFetchContents =
    propertiesFieldNode?.selectionSet?.selections
      ?.filter(
        (selection): selection is FieldNode => selection.kind === "Field",
      )
      .find(({ name }) => name.value === "contents") !== undefined;

  return {
    ...page.properties,
    // Legacy field of `block.properties`
    contents: shouldFetchContents
      ? (await page.getBlocks(dataSources.db)).map((block) =>
          block.toGQLUnknownEntity(),
        )
      : null,
  };
};
