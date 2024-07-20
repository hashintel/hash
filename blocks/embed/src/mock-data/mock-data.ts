import type { ProviderName } from "../types";

export interface EmbedDataType {
  initialHtml?: string;
  initialWidth?: number;
  initialHeight?: number;
  embedType?: ProviderName;
}
