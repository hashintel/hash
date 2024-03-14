import type { ProviderName } from "../types";

export type EmbedDataType = {
  initialHtml?: string;
  initialWidth?: number;
  initialHeight?: number;
  embedType?: ProviderName;
};
