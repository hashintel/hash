import { ProviderNames } from "../types";

export type EmbedDataType = {
  initialHtml?: string;
  initialWidth?: number;
  initialHeight?: number;
  embedType?: ProviderNames;
};

export const initialEmbedData: EmbedDataType = {};
