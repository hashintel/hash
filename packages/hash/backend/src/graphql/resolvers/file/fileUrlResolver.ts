import { FileProperties, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { presignS3FileDownload } from "../../../storage/s3";

export const fileUrlResolver: Resolver<string, FileProperties, GraphQLContext> =
  async (properties, _, _ctx, _info) => {
    const downloadURL = await presignS3FileDownload(properties.key);
    return downloadURL;
  };
