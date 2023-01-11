/** @todo - Fix Files - https://app.asana.com/0/1202805690238892/1203418451117503/f */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { File } from "../../../../model";
import { FileProperties, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";

export const fileUrlResolver: ResolverFn<
  string,
  FileProperties,
  GraphQLContext,
  {}
> = async (properties, _, _ctx, _info) => {
  const usedStorage = properties.storageType;
  const downloadURL = await File.getFileDownloadURL(usedStorage, {
    key: properties.key,
  });
  return downloadURL;
};
