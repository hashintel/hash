import { FileProperties, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { File } from "../../../model";

export const fileUrlResolver: Resolver<
  string,
  FileProperties,
  GraphQLContext
> = async (properties, _, _ctx, _info) => {
  const usedStorage = properties.storageType;
  const downloadURL = await File.getFileDownloadURL(usedStorage, {
    key: properties.key,
  });
  return downloadURL;
};
