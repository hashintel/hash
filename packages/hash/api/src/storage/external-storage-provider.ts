import { StorageType } from "../graphql/apiTypes.gen";
import { PresignedDownloadRequest, StorageProvider } from "./storage-provider";

/** Implementation of the storage provider for external links (doesn't actually store anything)
 * It stores the external link in the `key` property
 */
export class ExternalStorageProvider implements StorageProvider {
  /** The S3 client is created in the constructor and kept as long as the instance lives */
  public storageType = StorageType.ExternalLink;

  async presignDownload(params: PresignedDownloadRequest): Promise<string> {
    return params.key;
  }
}
