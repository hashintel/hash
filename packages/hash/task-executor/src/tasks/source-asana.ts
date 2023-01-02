import { BaseExecutor } from "../airbyte/executor";

const IMAGE_NAME = "airbyte/source-asana";

export class AsanaIngestor extends BaseExecutor {
  constructor() {
    super(IMAGE_NAME);
  }
}
