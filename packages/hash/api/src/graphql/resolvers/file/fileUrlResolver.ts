import { ApolloError } from "apollo-server-express";
import { FileProperties, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { File } from "../../../model";

export const fileUrlResolver: Resolver<
  string,
  FileProperties,
  GraphQLContext
> = async (properties, _, { storageProviders }, _info) => {
  const usedStorage = properties.storageType;
  const storageProvider = storageProviders[usedStorage];
  if (!storageProvider) {
    throw new ApolloError(
      `File entity was stored with unavailable storage provider: ${usedStorage}, so its url can't be retrieved.`,
      "NOT_FOUND",
    );
  }
  const downloadURL = await File.getFileDownloadURL(storageProvider, {
    key: properties.key,
  });
  return downloadURL;
};
