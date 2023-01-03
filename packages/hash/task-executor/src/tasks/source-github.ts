/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { BaseExecutor } from "../airbyte/executor";

const IMAGE_NAME = "airbyte/source-github";

export class GithubIngestor extends BaseExecutor {
  constructor() {
    super(IMAGE_NAME);
  }
}
