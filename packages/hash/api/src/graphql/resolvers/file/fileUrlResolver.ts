import { FileProperties, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { File } from "../../../model";

export const fileUrlResolver: ResolverFn<
  string,
  FileProperties,
  GraphQLContext,
  []
> = async (properties, _, _ctx, _info) => {
  const usedStorage = properties.storageType;
  const downloadURL = await File.getFileDownloadURL(usedStorage, {
    key: properties.key,
  });
  return downloadURL;
};
