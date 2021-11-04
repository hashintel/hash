import { FileProperties, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { File } from "../../../model";

export const fileUrlResolver: Resolver<string, FileProperties, GraphQLContext> =
  async (properties, _, ctx, _info) => {
    const downloadURL = await File.getFileDownloadURL(ctx.storageProvider, {
      key: properties.key,
    });
    return downloadURL;
  };
